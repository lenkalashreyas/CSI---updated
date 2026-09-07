import React, { useState, useEffect, useRef } from 'react';
import { Zap, Timer, ArrowRight, Trophy, CheckCircle2, XCircle, Gauge } from 'lucide-react';
import { sounds } from '../utils/soundEffects';
import confetti from 'canvas-confetti';

// Fixed time limit for every sudden-death question. Both teams draw from the
// same pool and face the same stakes each round, so the clock doesn't escalate
// the way the main-game timer does.
const SUDDEN_DEATH_TIME_LIMIT = 30;

export default function TieBreaker({
  tiebreakerQuestions, // pool of questions, worked through one at a time as sudden death continues
  teamA,
  teamB,
  onFinishTieBreaker,
  onLogRound // optional: called with a per-round record for the match history log
}) {
  // Sudden Death rules:
  //  - Team A answers first.
  //  - A correct answer passes the question to the other team.
  //  - The first incorrect answer ends it immediately — the OTHER team wins.
  //  - If the whole pool gets answered correctly with no mistakes, it's a
  //    tie on accuracy — the team with the LOWER total answer time wins.
  const [activeTeam, setActiveTeam] = useState('A'); // 'A' | 'B' — team currently on the clock
  const [questionCounter, setQuestionCounter] = useState(0); // index into the pool; also the round number
  const [history, setHistory] = useState([]); // [{ team, isCorrect, timeMs }] — full ledger, used for the time tie-break
  const [winnerTeam, setWinnerTeam] = useState(null); // 'A' | 'B' | 'TIE' once decided
  const [winReason, setWinReason] = useState(null); // 'ELIMINATION' | 'TIME' | 'DEAD_TIE'

  const [elapsedMs, setElapsedMs] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [isAnswerSubmitted, setIsAnswerSubmitted] = useState(false);
  const [lastCorrect, setLastCorrect] = useState(null);
  const [lastTimeMs, setLastTimeMs] = useState(0);

  const timerIntervalRef = useRef(null);
  const selectedOptionRef = useRef(selectedOption);
  const qStartRef = useRef(Date.now());
  selectedOptionRef.current = selectedOption;

  const pool = tiebreakerQuestions && tiebreakerQuestions.length > 0 ? tiebreakerQuestions : [];
  const currentQ = questionCounter < pool.length ? pool[questionCounter] : null;

  const activeTeamObj = activeTeam === 'A' ? teamA : teamB;
  const otherTeamObj = activeTeam === 'A' ? teamB : teamA;

  // Total time each team has spent across every question they've answered so
  // far — this is what decides the tie-break if nobody ever answers wrong.
  const getTeamTotalTime = (teamKey) =>
    history.filter((h) => h.team === teamKey).reduce((sum, h) => sum + h.timeMs, 0);

  const teamATotalTime = getTeamTotalTime('A');
  const teamBTotalTime = getTeamTotalTime('B');

  // Celebrate once a winner is locked in
  useEffect(() => {
    if (winnerTeam) {
      confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
      sounds.playVictory();
    }
  }, [winnerTeam]);

  // Start / reset the countdown whenever a new round begins
  useEffect(() => {
    if (winnerTeam || !currentQ) return;

    const startTime = Date.now();
    qStartRef.current = startTime;
    setElapsedMs(0);
    setSelectedOption(null);
    setIsAnswerSubmitted(false);
    setLastCorrect(null);

    timerIntervalRef.current = setInterval(() => {
      const diff = Date.now() - qStartRef.current;
      setElapsedMs(diff);

      if (diff >= SUDDEN_DEATH_TIME_LIMIT * 1000) {
        clearInterval(timerIntervalRef.current);
        // Timeout counts as no answer — treated the same as answering wrong,
        // and clocked at the full time limit.
        submitAnswer(selectedOptionRef.current);
      }
    }, 50);

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionCounter, activeTeam, winnerTeam]);

  const submitAnswer = (optionIdx) => {
    if (isAnswerSubmitted || winnerTeam) return;
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

    // Measured against this round's own start time and capped at the time
    // limit, so a timeout can never count for less than the full limit and a
    // fast manual answer is recorded to the millisecond.
    const rawElapsed = Date.now() - qStartRef.current;
    const takenMs = Math.min(rawElapsed, SUDDEN_DEATH_TIME_LIMIT * 1000);

    setIsAnswerSubmitted(true);
    setSelectedOption(optionIdx);
    setLastTimeMs(takenMs);

    const isCorrect = optionIdx !== null && optionIdx === currentQ.correctIndex;
    setLastCorrect(isCorrect);
    setHistory((prev) => [...prev, { team: activeTeam, isCorrect, timeMs: takenMs }]);

    if (isCorrect) {
      sounds.playCorrect();
    } else {
      sounds.playWrong();
    }

    if (onLogRound) {
      onLogRound({
        round: questionCounter + 1,
        team: activeTeam,
        teamName: (activeTeam === 'A' ? teamA : teamB).name,
        questionText: currentQ.question,
        chosenAnswerText: optionIdx !== null ? currentQ.options[optionIdx] : null,
        correctAnswerText: currentQ.options[currentQ.correctIndex],
        isCorrect,
        timeTaken: takenMs / 1000,
        timeLimit: SUDDEN_DEATH_TIME_LIMIT
      });
    }
  };

  const handleSelectAndSubmit = (idx) => {
    if (isAnswerSubmitted) return;
    submitAnswer(idx);
  };

  // Called once the whole pool has been answered correctly with no mistakes —
  // compares accumulated time across every recorded answer for each team.
  const decideByTime = () => {
    const aTime = getTeamTotalTime('A');
    const bTime = getTeamTotalTime('B');
    if (aTime < bTime) {
      setWinnerTeam('A');
      setWinReason('TIME');
    } else if (bTime < aTime) {
      setWinnerTeam('B');
      setWinReason('TIME');
    } else {
      // Exact tie down to the millisecond — vanishingly rare, but handled.
      setWinnerTeam('TIE');
      setWinReason('DEAD_TIE');
    }
  };

  const handleContinue = () => {
    if (!lastCorrect) {
      setWinnerTeam(activeTeam === 'A' ? 'B' : 'A');
      setWinReason('ELIMINATION');
      return;
    }

    const nextCounter = questionCounter + 1;
    if (nextCounter >= pool.length) {
      // Every question in the pool has now been answered correctly by
      // someone — accuracy alone can't separate the teams, so fall back to
      // total answer time.
      decideByTime();
      return;
    }

    setActiveTeam((prev) => (prev === 'A' ? 'B' : 'A'));
    setQuestionCounter(nextCounter);
  };

  const formatMs = (ms) => `${(ms / 1000).toFixed(2)}s`;
  const timePercent = Math.max(0, 100 - (elapsedMs / (SUDDEN_DEATH_TIME_LIMIT * 1000)) * 100);

  // === RESULT SCREEN ===
  if (winnerTeam) {
    if (winReason === 'DEAD_TIE') {
      return (
        <div className="tiebreaker-results-card">
          <Trophy className="trophy-gold" size={64} />
          <h2>PERFECT TIE!</h2>
          <p className="tb-elimination-summary">
            Both teams answered every question correctly in the exact same total time.
          </p>
          <button className="btn-finish-all" onClick={() => onFinishTieBreaker('TIE GAME!')}>
            COMPLETE ROUND 2 <ArrowRight size={20} />
          </button>
        </div>
      );
    }

    const winnerObj = winnerTeam === 'A' ? teamA : teamB;
    const loserObj = winnerTeam === 'A' ? teamB : teamA;

    return (
      <div className="tiebreaker-results-card">
        <Trophy className="trophy-gold" size={64} />
        <h2>{winReason === 'TIME' ? 'WON ON SPEED!' : 'SUDDEN DEATH CHAMPION!'}</h2>
        <h1 className="winner-title">{winnerObj.name}</h1>
        <p className="tb-elimination-summary">
          {winReason === 'TIME'
            ? `Both teams answered every question correctly — ${winnerObj.name} wins with the faster total time!`
            : `${loserObj.name} answered incorrectly — ${winnerObj.name} takes it instantly!`}
        </p>

        {winReason === 'TIME' && (
          <div className="tiebreaker-comparison-grid">
            <div className={`team-res-card ${winnerTeam === 'A' ? 'winner-card' : ''}`}>
              <h3>{teamA.name}</h3>
              <div className="res-stat">
                <span>Total Answer Time:</span>
                <strong>{formatMs(teamATotalTime)}</strong>
              </div>
            </div>
            <div className={`team-res-card ${winnerTeam === 'B' ? 'winner-card' : ''}`}>
              <h3>{teamB.name}</h3>
              <div className="res-stat">
                <span>Total Answer Time:</span>
                <strong>{formatMs(teamBTotalTime)}</strong>
              </div>
            </div>
          </div>
        )}

        <button className="btn-finish-all" onClick={() => onFinishTieBreaker(winnerObj.name)}>
          COMPLETE ROUND 2 <ArrowRight size={20} />
        </button>
      </div>
    );
  }

  if (!currentQ) {
    return (
      <div className="tiebreaker-container">
        <p>No tie-breaker questions available.</p>
      </div>
    );
  }

  return (
    <div className="tiebreaker-container">
      <div className="tiebreaker-banner">
        <Zap className="bolt-icon" size={28} />
        <div>
          <h2>⚡ SUDDEN DEATH TIE-BREAKER ⚡</h2>
          <p>
            Answer correctly to pass the question along — the first wrong answer ends it instantly.
            If every question gets answered correctly, the fastest total time wins!
          </p>
        </div>
      </div>

      {/* Round-by-round ledger so both teams can see the streak so far */}
      {history.length > 0 && (
        <div className="tb-history-track">
          {history.map((h, i) => (
            <span
              key={i}
              className={`tb-history-chip ${h.team === 'A' ? 'color-a' : 'color-b'} ${h.isCorrect ? 'tb-chip-correct' : 'tb-chip-wrong'}`}
              title={`${h.team === 'A' ? teamA.name : teamB.name}: ${h.isCorrect ? 'Correct' : 'Wrong'} (${formatMs(h.timeMs)})`}
            >
              {h.isCorrect ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
            </span>
          ))}
        </div>
      )}

      {/* Live running total — the exact figure the time tie-break will use */}
      <div className="tb-time-tally">
        <span className="tb-time-chip color-a">
          <Gauge size={14} /> {teamA.name}: {formatMs(teamATotalTime)}
        </span>
        <span className="tb-time-chip color-b">
          <Gauge size={14} /> {teamB.name}: {formatMs(teamBTotalTime)}
        </span>
      </div>

      <div className={`tb-active-team-banner ${activeTeam === 'A' ? 'color-a' : 'color-b'}`}>
        <span className="tb-active-team-label">Round {questionCounter + 1} of {pool.length}</span>
        <h3>{activeTeamObj.name}'S TURN</h3>
        <span className="tb-active-team-sub">A wrong answer here hands the win to {otherTeamObj.name}</span>
      </div>

      <div className="tiebreaker-status-bar">
        <div className="active-team-indicator">
          Playing Now: <strong>{activeTeamObj.name}</strong>
        </div>
        <div className="speed-timer-pill">
          <Timer size={18} />
          <span>Time: {formatMs(elapsedMs)} / {SUDDEN_DEATH_TIME_LIMIT}s</span>
        </div>
      </div>

      <div className="tb-timer-bar-track">
        <div className="tb-timer-bar-fill" style={{ width: `${timePercent}%` }}></div>
      </div>

      <div className="tiebreaker-q-card">
        <h3 className="tb-question-text">{currentQ.question}</h3>

        <div className="options-grid">
          {currentQ.options.map((opt, idx) => {
            let stateClass = '';
            if (isAnswerSubmitted) {
              if (idx === currentQ.correctIndex) stateClass = 'option-correct';
              else if (idx === selectedOption) stateClass = 'option-wrong';
              else stateClass = 'option-disabled';
            } else if (idx === selectedOption) {
              stateClass = 'option-selected';
            }

            return (
              <button
                key={idx}
                className={`option-card ${stateClass}`}
                disabled={isAnswerSubmitted}
                onClick={() => handleSelectAndSubmit(idx)}
              >
                <span className="option-key">{String.fromCharCode(65 + idx)}</span>
                <span className="option-text">{opt}</span>
              </button>
            );
          })}
        </div>

        {isAnswerSubmitted && (
          <div className="tb-next-footer">
            <div className={`tb-result-banner ${lastCorrect ? 'tb-result-correct' : 'tb-result-wrong'}`}>
              {lastCorrect
                ? `✅ Correct in ${formatMs(lastTimeMs)}! ${otherTeamObj.name} is up next.`
                : `❌ Incorrect! ${otherTeamObj.name} wins the tie-breaker!`}
            </div>
            <button className="btn-next-tb" onClick={handleContinue}>
              {lastCorrect ? `${otherTeamObj.name}'S TURN` : 'SEE RESULT'} <ArrowRight size={18} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
