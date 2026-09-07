import React, { useState, useEffect, useRef } from 'react';
import { Zap, Timer, ArrowRight, Trophy, CheckCircle2, XCircle, Gauge } from 'lucide-react';
import { sounds } from '../utils/soundEffects';
import confetti from 'canvas-confetti';

// Fixed time limit for every sudden-death question.
const SUDDEN_DEATH_TIME_LIMIT = 30;

// Gap shown between tie-breaker questions and before the first question starts.
const BETWEEN_QUESTIONS_PREP_SECONDS = 5;

export default function TieBreaker({
  tiebreakerQuestions,
  teamA,
  teamB,
  onFinishTieBreaker,
  onLogRound
}) {
  const [activeTeam, setActiveTeam] = useState('A'); 
  const [questionCounter, setQuestionCounter] = useState(0); 
  const [history, setHistory] = useState([]); 
  const [winnerTeam, setWinnerTeam] = useState(null); 
  const [winReason, setWinReason] = useState(null); 

  const [elapsedMs, setElapsedMs] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [isAnswerSubmitted, setIsAnswerSubmitted] = useState(false);
  const [lastCorrect, setLastCorrect] = useState(null);
  const [lastTimeMs, setLastTimeMs] = useState(0);

  // Initialized to true and 5 so the prep screen pops up BEFORE the first question as well
  const [isPrepping, setIsPrepping] = useState(true);
  const [prepSecondsLeft, setPrepSecondsLeft] = useState(BETWEEN_QUESTIONS_PREP_SECONDS);
  const pendingAdvanceRef = useRef(null); 

  const timerIntervalRef = useRef(null);
  const selectedOptionRef = useRef(selectedOption);
  const qStartRef = useRef(Date.now());
  selectedOptionRef.current = selectedOption;

  const pool = tiebreakerQuestions && tiebreakerQuestions.length > 0 ? tiebreakerQuestions : [];
  const currentQ = questionCounter < pool.length ? pool[questionCounter] : null;

  const activeTeamObj = activeTeam === 'A' ? teamA : teamB;
  const otherTeamObj = activeTeam === 'A' ? teamB : teamA;

  const isSecondOfRound = questionCounter % 2 === 1;

  const getTeamTotalTime = (teamKey) =>
    history.filter((h) => h.team === teamKey).reduce((sum, h) => sum + h.timeMs, 0);

  const teamATotalTime = getTeamTotalTime('A');
  const teamBTotalTime = getTeamTotalTime('B');

  useEffect(() => {
    if (winnerTeam) {
      confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
      sounds.playVictory();
    }
  }, [winnerTeam]);

  // Drive the prep countdown. Runs at the start and between questions.
  useEffect(() => {
    if (!isPrepping) return;

    if (prepSecondsLeft <= 0) {
      const pending = pendingAdvanceRef.current;
      pendingAdvanceRef.current = null;
      setIsPrepping(false);
      if (pending) {
        setActiveTeam(pending.activeTeam);
        setQuestionCounter(pending.questionCounter);
      }
      return;
    }

    const id = setTimeout(() => setPrepSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [isPrepping, prepSecondsLeft]);

  // Start / reset the question timer when prep finishes and a question starts
  useEffect(() => {
    if (winnerTeam || !currentQ || isPrepping) return;

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
        submitAnswer(selectedOptionRef.current);
      }
    }, 50);

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionCounter, activeTeam, winnerTeam, isPrepping]);

  const submitAnswer = (optionIdx) => {
    if (isAnswerSubmitted || winnerTeam) return;
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

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
        round: Math.floor(questionCounter / 2) + 1,
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
      setWinnerTeam('TIE');
      setWinReason('DEAD_TIE');
    }
  };

  const startPrepThenAdvance = (nextActiveTeam, nextQuestionCounter) => {
    pendingAdvanceRef.current = { activeTeam: nextActiveTeam, questionCounter: nextQuestionCounter };
    setPrepSecondsLeft(BETWEEN_QUESTIONS_PREP_SECONDS);
    setIsPrepping(true);
  };

  const handleContinue = () => {
    const nextCounter = questionCounter + 1;

    if (!isSecondOfRound) {
      if (nextCounter >= pool.length) {
        decideByTime();
        return;
      }
      startPrepThenAdvance('B', nextCounter);
      return;
    }

    const teamAResult = history[history.length - 2];
    const teamBResult = history[history.length - 1];

    if (teamAResult && teamBResult && teamAResult.isCorrect !== teamBResult.isCorrect) {
      const winner = teamAResult.isCorrect ? 'A' : 'B';
      setWinnerTeam(winner);
      setWinReason('SPLIT_ROUND');
      return;
    }

    if (nextCounter >= pool.length) {
      decideByTime();
      return;
    }
    startPrepThenAdvance('A', nextCounter);
  };

  const formatMs = (ms) => `${(ms / 1000).toFixed(2)}s`;
  const timePercent = Math.max(0, 100 - (elapsedMs / (SUDDEN_DEATH_TIME_LIMIT * 1000)) * 100);

  let roundStatusNote = null;
  if (isAnswerSubmitted) {
    if (!isSecondOfRound) {
      roundStatusNote = `${otherTeamObj.name} is up next in this round — only a different result (right vs. wrong) decides it.`;
    } else {
      const teamAResult = history[history.length - 2];
      const teamBResult = history[history.length - 1];
      if (teamAResult && teamBResult && teamAResult.isCorrect !== teamBResult.isCorrect) {
        roundStatusNote = 'This round split the teams — it\'s decided!';
      } else {
        roundStatusNote = 'Both teams matched this round — sudden death continues!';
      }
    }
  }

  // === RESULT SCREEN ===
  if (winnerTeam) {
    if (winReason === 'DEAD_TIE') {
      return (
        <div className="tiebreaker-results-card">
          <Trophy className="trophy-gold" size={64} />
          <h2>PERFECT TIE!</h2>
          <p className="tb-elimination-summary">
            Both teams matched every round and answered in the exact same total time.
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
            ? `Both teams matched every round — ${winnerObj.name} wins with the faster total time!`
            : `${winnerObj.name} answered correctly while ${loserObj.name} didn't in the same round — sudden death decided!`}
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

  // === BETWEEN-QUESTIONS / INITIAL PREP SCREEN ===
  if (isPrepping) {
    const upcomingTeamObj = pendingAdvanceRef.current
      ? (pendingAdvanceRef.current.activeTeam === 'B' ? teamB : teamA)
      : (activeTeam === 'A' ? teamA : teamB);

    return (
      <div className="tiebreaker-container">
        <div className="tiebreaker-banner">
          <Zap className="bolt-icon" size={28} />
          <div>
            <h2>⚡ SUDDEN DEATH TIE-BREAKER ⚡</h2>
            <p>
              Penalty-shootout rules: each round, both teams answer once. Match each other (both right
              or both wrong) and it rolls on — split the round and the team that got it right wins instantly.
              If every round matches, the fastest total time wins!
            </p>
          </div>
        </div>

        <div className="board-launch-card" style={{ textAlign: 'center' }}>
          <Timer size={48} />
          <h2>Get Ready — {upcomingTeamObj.name}!</h2>
          <p>Next sudden-death question in:</p>
          <div className="tiebreaker-prep-countdown" style={{ fontSize: '4rem', fontWeight: 800, marginTop: '1rem' }}>
            {prepSecondsLeft}
          </div>
        </div>
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
            Penalty-shootout rules: each round, both teams answer once. Match each other (both right
            or both wrong) and it rolls on — split the round and the team that got it right wins instantly.
            If every round matches, the fastest total time wins!
          </p>
        </div>
      </div>

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

      <div className="tb-time-tally">
        <span className="tb-time-chip color-a">
          <Gauge size={14} /> {teamA.name}: {formatMs(teamATotalTime)}
        </span>
        <span className="tb-time-chip color-b">
          <Gauge size={14} /> {teamB.name}: {formatMs(teamBTotalTime)}
        </span>
      </div>

      <div className={`tb-active-team-banner ${activeTeam === 'A' ? 'color-a' : 'color-b'}`}>
        <span className="tb-active-team-label">Round {Math.floor(questionCounter / 2) + 1} of {Math.ceil(pool.length / 2)}</span>
        <h3>{activeTeamObj.name}'S TURN</h3>
        <span className="tb-active-team-sub">
          {questionCounter % 2 === 0
            ? `${otherTeamObj.name} answers right after — a split result decides the round.`
            : `A different result than ${otherTeamObj.name}'s hands the win to ${activeTeamObj.name} right now!`}
        </span>
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
                ? `✅ Correct in ${formatMs(lastTimeMs)}!`
                : `❌ Incorrect!`}
              {' '}{roundStatusNote}
            </div>
            <button className="btn-next-tb" onClick={handleContinue}>
              {!isSecondOfRound ? `${otherTeamObj.name}'S TURN` : 'SEE RESULT'} <ArrowRight size={18} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
