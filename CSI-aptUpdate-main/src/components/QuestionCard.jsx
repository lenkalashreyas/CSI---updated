import React, { useState, useEffect, useRef } from 'react';
import { Clock, ShieldAlert, CheckCircle, XCircle, ArrowRight, Bomb, ShieldOff } from 'lucide-react';
import { sounds } from '../utils/soundEffects';

export default function QuestionCard({
  question,
  difficulty, // 'easy' | 'medium' | 'hard' | 'very_hard'
  timeLimit, // effective time (may be reduced by TimeBomb)
  points, // 1, 2, or 3
  isChallenged,
  isTimeBombed = false,
  timeBombReduction = 0,
  activeTeamName,
  opposingTeamName,
  noEscapeAvailable = false,
  isNoEscapeTarget = false,
  noEscapeActivatorName = '',
  onNoEscape,
  opposingPowerUps = { challenge: false, timeBomb: false },
  onInlinePowerUp,
  onSubmitAnswer
}) {
  const [timeLeft, setTimeLeft] = useState(timeLimit);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [answerResult, setAnswerResult] = useState(null);

  const timerRef = useRef(null);
  const selectedIndexRef = useRef(selectedIndex);
  selectedIndexRef.current = selectedIndex;
  // Wall-clock start time for this question, used to compute an exact
  // "time taken" figure for the match history log — independent of the
  // 1-second tick granularity of the visible countdown.
  const questionStartRef = useRef(Date.now());

  // Guard against a missing/not-yet-loaded question so a bad state never
  // crashes the whole app — show a small fallback instead of throwing.
  if (!question) {
    return (
      <div className="question-card">
        <h2 className="question-title">Loading question…</h2>
        <p>If this doesn't go away, please refresh the page.</p>
      </div>
    );
  }

  // Sound tick effect on low time
  useEffect(() => {
    if (timeLeft > 0 && timeLeft <= 5 && !isSubmitted) {
      sounds.playTick();
    }
  }, [timeLeft, isSubmitted]);

  // Main countdown timer
  useEffect(() => {
    setTimeLeft(timeLimit);
    setSelectedIndex(null);
    setIsSubmitted(false);
    setAnswerResult(null);
    questionStartRef.current = Date.now();

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          handleAutoSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [question, timeLimit]);

  // Handle auto-submit when timer hits 0
  const handleAutoSubmit = () => {
    if (isSubmitted) return;
    executeSubmission(selectedIndexRef.current);
  };

  // Keyboard shortcut listener (1-4 keys)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isSubmitted) return;
      if (['1', '2', '3', '4'].includes(e.key)) {
        const idx = parseInt(e.key) - 1;
        if (idx >= 0 && idx < question.options.length) {
          setSelectedIndex(idx);
        }
      } else if (e.key === 'Enter' && selectedIndex !== null) {
        executeSubmission(selectedIndex);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex, isSubmitted, question]);

  const executeSubmission = (chosenIndex) => {
    if (isSubmitted) return;
    if (timerRef.current) clearInterval(timerRef.current);
    setIsSubmitted(true);

    const isCorrect = chosenIndex !== null && chosenIndex === question.correctIndex;

    // Exact elapsed time since the question appeared, capped at the time
    // limit (a timeout can never register as taking longer than the clock
    // allowed). This feeds the match history / dispute log.
    const rawElapsedSeconds = (Date.now() - questionStartRef.current) / 1000;
    const timeTaken = Math.max(0, Math.min(timeLimit, rawElapsedSeconds));

    // Calculate point delta
    let delta = 0;
    if (isCorrect) {
      delta = points;
      sounds.playCorrect();
      sounds.playRopePull(1);
    } else {
      sounds.playWrong();
      if (isChallenged) {
        delta = -(points * 2);
        sounds.playRopePull(-1);
      }
    }

    const resultObj = {
      isCorrect,
      chosenIndex,
      correctIndex: question.correctIndex,
      delta,
      isChallenged,
      explanation: question.explanation,
      // Extra context so the caller can build a match history entry without
      // having to reach back into this component's internals.
      questionText: question.question,
      chosenAnswerText: chosenIndex !== null ? question.options[chosenIndex] : null,
      correctAnswerText: question.options[question.correctIndex],
      timeTaken,
      timeLimit
    };

    setAnswerResult(resultObj);
  };

  const handleManualSubmit = () => {
    if (selectedIndex === null) return;
    executeSubmission(selectedIndex);
  };

  const handleNextTurn = () => {
    if (answerResult) {
      onSubmitAnswer(answerResult);
    }
  };

  // Calculate percentage of timer
  const timerPercent = (timeLeft / timeLimit) * 100;
  const isUrgent = timeLeft <= 5;

  // Difficulty display helpers
  const getDiffLabel = (diff) => {
    if (diff === 'very_hard') return 'VERY HARD';
    return diff.toUpperCase();
  };

  const getDiffClass = (diff) => {
    if (diff === 'very_hard') return 'diff-very-hard';
    return `diff-${diff}`;
  };

  return (
    <div className={`question-card-container ${getDiffClass(difficulty)}`}>
      {/* No Escape Target Banner */}
      {isNoEscapeTarget && (
        <div className="no-escape-target-banner">
          <ShieldOff size={22} />
          <span>
            🚫 NO ESCAPE! {noEscapeActivatorName.toUpperCase()} forced you to answer this question!
          </span>
        </div>
      )}

      {/* Challenge Banner if active */}
      {isChallenged && (
        <div className="challenged-active-banner">
          <ShieldAlert size={22} className="pulse-icon" />
          <span>
            ⚔️ CHALLENGE ACTIVATED BY {opposingTeamName.toUpperCase()}! Question upgraded to {getDiffLabel(difficulty)}! Wrong = {points * 2} PTS penalty!
          </span>
        </div>
      )}

      {/* TimeBomb Banner if active */}
      {isTimeBombed && (
        <div className="timebomb-active-banner">
          <Bomb size={22} />
          <span>
            💣 TIMEBOMB! Timer reduced by {timeBombReduction}s! Only {timeLimit}s to answer!
          </span>
        </div>
      )}

      {/* Card Header & Timer */}
      <div className="question-header">
        <div className="meta-left">
          <span className={`diff-pill ${getDiffClass(difficulty)}`}>
            {getDiffLabel(difficulty)} ({points} PT{points > 1 ? 'S' : ''})
          </span>
          <span className="turn-indicator-pill">
            Turn: <strong>{activeTeamName}</strong>
          </span>
        </div>

        {/* Dynamic Timer */}
        <div className={`timer-box ${isUrgent ? 'timer-urgent' : ''} ${isTimeBombed ? 'timer-bombed' : ''}`}>
          {isTimeBombed && <Bomb size={16} className="bomb-icon-small" />}
          <Clock size={20} className="clock-icon" />
          <span className="time-number">{timeLeft}s</span>
          <div className="timer-bar-track">
            <div
              className="timer-bar-fill"
              style={{ width: `${timerPercent}%` }}
            ></div>
          </div>
        </div>
      </div>



      {/* Main Question Text */}
      <div className="question-text-box">
        <h2 className="question-title">{question.question}</h2>
      </div>

      {/* No Escape Availability — its own bar, clearly separated from the
          answer options below, so the power-up doesn't get lost */}
      {!isSubmitted && noEscapeAvailable && !isNoEscapeTarget && onNoEscape && (
        <div className="no-escape-availability-bar">
          <div className="no-escape-availability-label">
            <ShieldOff size={20} />
            <span>Power-Up Available</span>
          </div>
          <button
            className="btn-no-escape-prominent"
            onClick={onNoEscape}
            title="Force the opposing team to answer this question"
          >
            🚫 NO ESCAPE — Pass to {opposingTeamName}
          </button>
        </div>
      )}

      {/* Options List */}
      <div className="options-grid">
        {question.options.map((opt, idx) => {
          let stateClass = '';
          if (isSubmitted) {
            if (idx === question.correctIndex) {
              stateClass = 'option-correct';
            } else if (idx === selectedIndex) {
              stateClass = 'option-wrong';
            } else {
              stateClass = 'option-disabled';
            }
          } else if (idx === selectedIndex) {
            stateClass = 'option-selected';
          }

          return (
            <button
              key={idx}
              className={`option-card ${stateClass}`}
              onClick={() => !isSubmitted && setSelectedIndex(idx)}
              disabled={isSubmitted}
            >
              <span className="option-key">{String.fromCharCode(65 + idx)}</span>
              <span className="option-text">{opt}</span>
              {isSubmitted && idx === question.correctIndex && (
                <CheckCircle className="status-icon icon-correct" size={22} />
              )}
              {isSubmitted && idx === selectedIndex && idx !== question.correctIndex && (
                <XCircle className="status-icon icon-wrong" size={22} />
              )}
            </button>
          );
        })}
      </div>

      {/* Controls & Feedback Footer */}
      <div className="question-footer">
        {!isSubmitted ? (
          <div className="pre-submit-footer">
            <div className="footer-left-actions">
              <span className="key-hint">Press 1-4 to select, Enter to submit</span>
            </div>
            <button
              className="btn-submit-answer"
              onClick={handleManualSubmit}
              disabled={selectedIndex === null}
            >
              SUBMIT ANSWER
            </button>
          </div>
        ) : (
          <div className="post-submit-footer">
            <div className={`result-summary ${answerResult?.isCorrect ? 'res-success' : 'res-danger'}`}>
              <div className="res-title">
                {answerResult?.isCorrect ? (
                  <span>✅ CORRECT! +{points} Pts awarded to {activeTeamName}</span>
                ) : isNoEscapeTarget ? (
                  answerResult?.isCorrect ? (
                    <span>✅ Answered correctly — No points awarded!</span>
                  ) : (
                    <span>❌ INCORRECT! {noEscapeActivatorName} gains +{points} Pts from No Escape!</span>
                  )
                ) : isChallenged ? (
                  <span>❌ INCORRECT ON CHALLENGE! {opposingTeamName} gains +{points * 2} Pts!</span>
                ) : (
                  <span>❌ INCORRECT! 0 Pts awarded</span>
                )}
              </div>
              {answerResult?.explanation && (
                <p className="res-explanation">
                  <strong>Explanation:</strong> {answerResult.explanation}
                </p>
              )}
            </div>

            <button className="btn-next-question" onClick={handleNextTurn}>
              CONTINUE GAME <ArrowRight size={20} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
