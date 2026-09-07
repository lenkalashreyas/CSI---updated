import React, { useState, useEffect, useCallback } from 'react';
import RopeVisualizer from './components/RopeVisualizer';
import Scoreboard from './components/Scoreboard';
import QuestionCard from './components/QuestionCard';
import TieBreaker from './components/TieBreaker';
import JsonManagerModal from './components/JsonManagerModal';
import MatchHistoryModal from './components/MatchHistoryModal';
import { sounds } from './utils/soundEffects';
import confetti from 'canvas-confetti';
import { Trophy, Zap, Play, RotateCcw, Settings, Award, History } from 'lucide-react';

export default function App() {
  // Game Configuration & Question Data State
  const [questionsData, setQuestionsData] = useState(null);
  // 'SETUP' | 'BOARD' | 'QUESTION' | 'NO_ESCAPE_QUESTION' | 'TIE_BREAKER' | 'GAME_OVER'
  const [gameMode, setGameMode] = useState('SETUP');

  // Team States
  const [teamA, setTeamA] = useState({
    name: 'Red Dragons',
    score: 0,
    powerUps: { challenge: true, timeBomb: true, noEscape: true }
  });
  const [teamB, setTeamB] = useState({
    name: 'Blue Titans',
    score: 0,
    powerUps: { challenge: true, timeBomb: true, noEscape: true }
  });

  // Game Mechanics State
  const [ropePosition, setRopePosition] = useState(0); // range: -25 to +25. KO at ±20
  const [lastDelta, setLastDelta] = useState(0);
  const [activeTeam, setActiveTeam] = useState('A'); // 'A' or 'B'
  const [currentTurnIndex, setCurrentTurnIndex] = useState(0); // 0 to 35 (36 total turns)

  // Power-up state for current turn
  const [activePowerUp, setActivePowerUp] = useState(null); // null | 'challenge' | 'timeBomb'
  const [challengeQuestion, setChallengeQuestion] = useState(null); // upgraded question for challenge

  // No Escape state
  const [noEscapeData, setNoEscapeData] = useState(null);
  // { question, difficulty, points, originalPoints, activatingTeam, originalActiveTeam }

  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isJsonModalOpen, setIsJsonModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

  // Full post-game / mid-game match history — one entry per question asked,
  // across the whole game (normal turns, challenges, timebombs, no escapes,
  // and the tie-breaker). This is the ledger organizers can pull up to
  // resolve any participant dispute about what happened and when.
  const [matchHistory, setMatchHistory] = useState([]);

  // Winner Information
  const [winnerInfo, setWinnerInfo] = useState(null);

  // Load questions on mount
  useEffect(() => {
    fetch('/questions.json')
      .then((res) => res.json())
      .then((data) => setQuestionsData(data))
      .catch((err) => console.error('Error loading default questions.json:', err));
  }, []);

  const handleStartGame = () => {
    setTeamA((prev) => ({
      ...prev,
      score: 0,
      powerUps: { challenge: true, timeBomb: true, noEscape: true }
    }));
    setTeamB((prev) => ({
      ...prev,
      score: 0,
      powerUps: { challenge: true, timeBomb: true, noEscape: true }
    }));
    setRopePosition(0);
    setLastDelta(0);
    setActiveTeam('A');
    setCurrentTurnIndex(0);
    setActivePowerUp(null);
    setChallengeQuestion(null);
    setNoEscapeData(null);
    setWinnerInfo(null);
    setMatchHistory([]);
    setGameMode('BOARD');
    sounds.init();
  };

  // === MATCH HISTORY LOGGING ===
  // Every logged entry shares this shape so the MatchHistoryModal can treat
  // normal turns, power-up turns, and tie-breaker rounds uniformly.
  const logMatchEvent = useCallback((entry) => {
    setMatchHistory((prev) => [
      ...prev,
      { id: `${Date.now()}-${prev.length}`, timestamp: new Date().toISOString(), ...entry }
    ]);
  }, []);

  // === QUESTION ROUTING ===
  const getCurrentStage = () => {
    if (currentTurnIndex < 12) return 'easy';
    if (currentTurnIndex < 24) return 'medium';
    return 'hard';
  };

  const getStageRules = () => {
    const stage = getCurrentStage();
    if (stage === 'easy') return { difficulty: 'easy', timeLimit: 45, points: 1 };
    if (stage === 'medium') return { difficulty: 'medium', timeLimit: 60, points: 2 };
    return { difficulty: 'hard', timeLimit: 90, points: 3 };
  };

  const getTeamQuestionIndex = () => {
    const stageTurnOffset = currentTurnIndex < 12 ? 0 : currentTurnIndex < 24 ? 12 : 24;
    const turnWithinStage = currentTurnIndex - stageTurnOffset;
    return Math.floor(turnWithinStage / 2);
  };

  const getCurrentQuestion = () => {
    if (!questionsData || !questionsData.questions) return null;
    const stage = getCurrentStage();
    const teamKey = activeTeam === 'A' ? 'teamA' : 'teamB';
    const teamQuestions = questionsData.questions[teamKey];
    if (!teamQuestions) return null;

    const stageQuestions = teamQuestions[stage] || [];
    const qIndex = getTeamQuestionIndex();

    return stageQuestions[qIndex % stageQuestions.length] || stageQuestions[0];
  };

  const getChallengeUpgradeQuestion = () => {
    if (!questionsData?.questions?.challenge_upgrades) return null;
    const stage = getCurrentStage();
    let upgradeKey;
    if (stage === 'easy') upgradeKey = 'medium';
    else if (stage === 'medium') upgradeKey = 'hard';
    else upgradeKey = 'very_hard';

    const upgradeQuestions = questionsData.questions.challenge_upgrades[upgradeKey] || [];
    const qIndex = getTeamQuestionIndex();
    return upgradeQuestions[qIndex % upgradeQuestions.length] || upgradeQuestions[0];
  };

  const getTimeBombReduction = (difficulty) => {
    if (difficulty === 'easy') return 20;
    if (difficulty === 'medium') return 25;
    return 30;
  };

  // === INLINE POWER-UP HANDLER ===
  // Called before the question is revealed.
  // initiatorTeam is 'A' or 'B'
  const handleInlinePowerUp = useCallback((type, initiatorTeam) => {
    if (type === 'challenge') {
      if (initiatorTeam === 'A') {
        setTeamA((prev) => ({ ...prev, powerUps: { ...prev.powerUps, challenge: false } }));
      } else {
        setTeamB((prev) => ({ ...prev, powerUps: { ...prev.powerUps, challenge: false } }));
      }
      sounds.playChallengeAlert();
      const upgradeQ = getChallengeUpgradeQuestion();
      setChallengeQuestion(upgradeQ);
      setActivePowerUp({ type: 'challenge', by: initiatorTeam });
    } else if (type === 'timeBomb') {
      if (initiatorTeam === 'A') {
        setTeamA((prev) => ({ ...prev, powerUps: { ...prev.powerUps, timeBomb: false } }));
      } else {
        setTeamB((prev) => ({ ...prev, powerUps: { ...prev.powerUps, timeBomb: false } }));
      }
      sounds.playChallengeAlert();
      setActivePowerUp({ type: 'timeBomb', by: initiatorTeam });
    }
  }, [questionsData, currentTurnIndex]);

  // === NO ESCAPE HANDLER ===
  const handleNoEscape = useCallback(() => {
    const stageRules = getStageRules();
    const currentQ = activePowerUp?.type === 'challenge' && challengeQuestion
      ? challengeQuestion
      : getCurrentQuestion();

    const isChallenged = activePowerUp?.type === 'challenge';
    const answeringTeamKey = (isChallenged && activePowerUp?.by === 'A') ? 'B' : (isChallenged && activePowerUp?.by === 'B') ? 'A' : activeTeam;

    if (answeringTeamKey === 'A') {
      setTeamA((prev) => ({ ...prev, powerUps: { ...prev.powerUps, noEscape: false } }));
    } else {
      setTeamB((prev) => ({ ...prev, powerUps: { ...prev.powerUps, noEscape: false } }));
    }

    setNoEscapeData({
      question: currentQ,
      difficulty: stageRules.difficulty,
      points: stageRules.points,
      activatingTeam: answeringTeamKey
    });

    setGameMode('NO_ESCAPE_QUESTION');
  }, [activeTeam, activePowerUp, challengeQuestion, currentTurnIndex, questionsData]);

  // === NO ESCAPE RESULT HANDLER ===
  const handleNoEscapeResult = (result) => {
    const { isCorrect, chosenAnswerText, correctAnswerText, questionText, timeTaken, timeLimit } = result;
    const { points, activatingTeam, difficulty } = noEscapeData;
    // The team forced to answer (the No Escape "target") is the opposite of
    // whoever activated the power-up.
    const answeringTeam = activatingTeam === 'A' ? 'B' : 'A';
    let posChange = 0;
    let pointsAwardedTo = null;
    let pointsAwarded = 0;

    if (!isCorrect) {
      pointsAwardedTo = activatingTeam;
      pointsAwarded = points;
      if (activatingTeam === 'A') {
        posChange = -points;
        setTeamA((prev) => ({ ...prev, score: prev.score + points }));
      } else {
        posChange = +points;
        setTeamB((prev) => ({ ...prev, score: prev.score + points }));
      }
    }

    logMatchEvent({
      turnLabel: `Q${currentTurnIndex + 1}`,
      eventType: 'NO_ESCAPE',
      difficulty,
      answeringTeamKey: answeringTeam,
      answeringTeamName: answeringTeam === 'A' ? teamA.name : teamB.name,
      initiatorName: activatingTeam === 'A' ? teamA.name : teamB.name,
      questionText,
      chosenAnswerText,
      correctAnswerText,
      isCorrect,
      pointsAwardedToName: pointsAwardedTo === 'A' ? teamA.name : pointsAwardedTo === 'B' ? teamB.name : null,
      pointsAwarded,
      timeTaken,
      timeLimit
    });

    setLastDelta(posChange);
    const newPos = Math.max(-25, Math.min(25, ropePosition + posChange));
    setRopePosition(newPos);

    const koThreshold = questionsData?.rules?.knockoutThreshold || 20;
    if (newPos <= -koThreshold) {
      triggerGameOver(teamA.name, 'KNOCKOUT');
      setNoEscapeData(null);
      return;
    }
    if (newPos >= koThreshold) {
      triggerGameOver(teamB.name, 'KNOCKOUT');
      setNoEscapeData(null);
      return;
    }

    advanceTurn(newPos);
    setNoEscapeData(null);
  };

  // === SUBMIT ANSWER (Normal or Challenged) ===
  const handleSubmitAnswer = (result) => {
    const { isCorrect, isChallenged: wasChallenged, chosenAnswerText, correctAnswerText, questionText, timeTaken, timeLimit } = result;
    const stageRules = getStageRules();
    const pts = stageRules.points;
    let posChange = 0;

    const answeringTeam = (wasChallenged && activePowerUp?.type === 'challenge')
      ? (activePowerUp.by === 'A' ? 'B' : 'A')
      : activeTeam;

    let pointsAwardedTo = null; // 'A' | 'B' | null
    let pointsAwarded = 0;

    if (answeringTeam === 'A') {
      if (isCorrect) {
        posChange = -pts;
        pointsAwardedTo = 'A';
        pointsAwarded = pts;
        setTeamA((prev) => ({ ...prev, score: prev.score + pts }));
      } else if (wasChallenged) {
        // A failed the challenge issued by B, B gets 2x
        posChange = +(pts * 2);
        pointsAwardedTo = 'B';
        pointsAwarded = pts * 2;
        setTeamB((prev) => ({ ...prev, score: prev.score + (pts * 2) }));
      }
    } else {
      if (isCorrect) {
        posChange = +pts;
        pointsAwardedTo = 'B';
        pointsAwarded = pts;
        setTeamB((prev) => ({ ...prev, score: prev.score + pts }));
      } else if (wasChallenged) {
        // B failed the challenge issued by A, A gets 2x
        posChange = -(pts * 2);
        pointsAwardedTo = 'A';
        pointsAwarded = pts * 2;
        setTeamA((prev) => ({ ...prev, score: prev.score + (pts * 2) }));
      }
    }

    // Difficulty as actually presented (a challenge upgrades it a notch)
    const loggedDifficulty = wasChallenged
      ? (stageRules.difficulty === 'easy' ? 'medium' : stageRules.difficulty === 'medium' ? 'hard' : 'very_hard')
      : stageRules.difficulty;

    logMatchEvent({
      turnLabel: `Q${currentTurnIndex + 1}`,
      eventType: wasChallenged ? 'CHALLENGE' : (activePowerUp?.type === 'timeBomb' ? 'TIMEBOMB' : 'NORMAL'),
      difficulty: loggedDifficulty,
      answeringTeamKey: answeringTeam,
      answeringTeamName: answeringTeam === 'A' ? teamA.name : teamB.name,
      initiatorName: activePowerUp ? (activePowerUp.by === 'A' ? teamA.name : teamB.name) : null,
      questionText,
      chosenAnswerText,
      correctAnswerText,
      isCorrect,
      pointsAwardedToName: pointsAwardedTo === 'A' ? teamA.name : pointsAwardedTo === 'B' ? teamB.name : null,
      pointsAwarded,
      timeTaken,
      timeLimit
    });

    setLastDelta(posChange);
    const newPos = Math.max(-25, Math.min(25, ropePosition + posChange));
    setRopePosition(newPos);

    const koThreshold = questionsData?.rules?.knockoutThreshold || 20;
    if (newPos <= -koThreshold) {
      triggerGameOver(teamA.name, 'KNOCKOUT');
      return;
    }
    if (newPos >= koThreshold) {
      triggerGameOver(teamB.name, 'KNOCKOUT');
      return;
    }

    advanceTurn(newPos);
  };

  const advanceTurn = (currentPos) => {
    const nextTurn = currentTurnIndex + 1;
    if (nextTurn >= 36) {
      if (currentPos < 0) {
        triggerGameOver(teamA.name, 'ROPE POSITION');
      } else if (currentPos > 0) {
        triggerGameOver(teamB.name, 'ROPE POSITION');
      } else {
        setGameMode('TIE_BREAKER');
      }
      return;
    }
    setCurrentTurnIndex(nextTurn);
    setActiveTeam((prev) => (prev === 'A' ? 'B' : 'A'));
    setActivePowerUp(null);
    setChallengeQuestion(null);
    setGameMode('BOARD');
  };

  const triggerGameOver = (winnerName, method) => {
    setWinnerInfo({ name: winnerName, method });
    setGameMode('GAME_OVER');
    sounds.playVictory();
    confetti({ particleCount: 200, spread: 100, origin: { y: 0.5 } });
  };

  const handleFinishTieBreaker = (tbWinnerName) => {
    triggerGameOver(tbWinnerName, 'TIE BREAKER');
  };

  const toggleSound = () => {
    const enabled = sounds.toggleSound();
    setSoundEnabled(enabled);
  };

  if (!questionsData) {
    return (
      <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div className="loading-screen">
          <div className="loading-spinner"></div>
          <h2>Loading Code Clash...</h2>
        </div>
      </div>
    );
  }

  const currentQ = activePowerUp?.type === 'challenge' && challengeQuestion
    ? challengeQuestion
    : getCurrentQuestion();
  const stageRules = getStageRules();
  const opposingTeamKey = activeTeam === 'A' ? 'B' : 'A';
  const opposingTeamObj = activeTeam === 'A' ? teamB : teamA;
  const activeTeamObj = activeTeam === 'A' ? teamA : teamB;

  // Who is actually answering the question (changes when challenged)
  const isChallengedNow = activePowerUp?.type === 'challenge';
  const answeringTeamKey = isChallengedNow
    ? (activePowerUp.by === 'A' ? 'B' : 'A')
    : activeTeam;
  const answeringTeamObj = answeringTeamKey === 'A' ? teamA : teamB;


  const actualOpposingTeamObj = answeringTeamKey === 'A' ? teamB : teamA;

  let effectiveTimeLimit = stageRules.timeLimit;
  if (activePowerUp?.type === 'timeBomb') {
    const reduction = getTimeBombReduction(stageRules.difficulty);
    effectiveTimeLimit = Math.max(10, stageRules.timeLimit - reduction);
  }

  const displayDifficulty = activePowerUp?.type === 'challenge'
    ? (stageRules.difficulty === 'easy' ? 'medium' : stageRules.difficulty === 'medium' ? 'hard' : 'very_hard')
    : stageRules.difficulty;

  return (
    <div className="app-container">
      <Scoreboard
        stage={getCurrentStage()}
        questionNumber={currentTurnIndex + 1}
        teamA={teamA}
        teamB={teamB}
        activeTeam={activeTeam}
        soundEnabled={soundEnabled}
        onToggleSound={toggleSound}
        onOpenJsonManager={() => setIsJsonModalOpen(true)}
        onOpenMatchHistory={() => setIsHistoryModalOpen(true)}
        onResetGame={() => setGameMode('SETUP')}
      />

      {/* Main Game Screen (Always visible beneath overlays) */}
      {gameMode !== 'SETUP' && (
        <RopeVisualizer
          ropePosition={ropePosition}
          teamA={teamA}
          teamB={teamB}
          knockoutThreshold={questionsData.rules?.knockoutThreshold || 20}
          activeTeam={activeTeam}
          lastDelta={lastDelta}
        />
      )}

      {/* BOARD: Waiting for next turn to launch */}
      {gameMode === 'BOARD' && (
        <div className="board-launch-overlay">
          <div className="board-launch-card">
            
            <div className="active-turn-section">
              <div className="turn-identity">
                <div className="turn-label" style={{ color: activeTeam === 'A' ? 'var(--team-a-color)' : 'var(--team-b-color)' }}>
                  {activeTeamObj.name}'s Turn
                </div>
                <div className="turn-sub">
                  <span className={`level-indicator-badge badge-${stageRules.difficulty}`}>
                    {stageRules.difficulty.toUpperCase()} LEVEL • {stageRules.points} PTS
                  </span>
                </div>
              </div>
              
              <div className="active-team-powerups">
                {/* Challenge — active team can challenge the opponent */}
                {activeTeamObj.powerUps.challenge ? (
                  <button 
                    className="btn-pre-powerup challenge"
                    onClick={() => handleInlinePowerUp('challenge', activeTeam)}
                    title="Challenge: Force opponent to answer a harder question. If they fail, you get 2x points!"
                    disabled={!!activePowerUp}
                  >
                    ⚔️ CHALLENGE OPPONENT
                  </button>
                ) : (
                  <span className="pu-used-badge">⚔️ Challenge Used</span>
                )}

                {/* TimeBomb — active team can reduce opponent's timer (medium/hard only) */}
                {stageRules.difficulty !== 'easy' ? (
                  activeTeamObj.powerUps.timeBomb ? (
                    <button 
                      className="btn-pre-powerup timebomb"
                      onClick={() => handleInlinePowerUp('timeBomb', activeTeam)}
                      title="TimeBomb: Reduce the answering team's timer!"
                      disabled={!!activePowerUp}
                    >
                      💣 TIMEBOMB
                    </button>
                  ) : (
                    <span className="pu-used-badge">💣 TimeBomb Used</span>
                  )
                ) : (
                  <span className="level-restriction-badge">💣 TimeBomb (Med/Hard Only)</span>
                )}

                {/* No Escape — this is the ACTIVE team's own power-up: once the
                    question is revealed, they can hand it to the opponent
                    instead of answering it themselves. Shown here alongside
                    Challenge/TimeBomb (instead of under "Opponent Actions",
                    where it doesn't belong) so it's visible up front. */}
                {activeTeamObj.powerUps.noEscape ? (
                  <span className="pu-available-badge no-escape-preview">
                    🚫 NO ESCAPE (use after reveal)
                  </span>
                ) : (
                  <span className="pu-used-badge">🚫 No Escape Used</span>
                )}
              </div>

              <button className="btn-launch-question" onClick={() => setGameMode('QUESTION')}>
                <Play size={20} /> REVEAL QUESTION
              </button>
            </div>

            <div className="opponent-action-section">
              <div className="opponent-label" style={{ color: activeTeam === 'A' ? 'var(--team-b-color)' : 'var(--team-a-color)' }}>
                {opposingTeamObj.name} (Opponent) Actions:
              </div>
              <div className="pre-question-powerups">
                {activePowerUp ? (
                  <div className="active-powerup-badge">
                    {activePowerUp.type === 'challenge' ? '⚔️ CHALLENGED!' : '💣 TIME BOMBED!'}
                  </div>
                ) : (
                  <span className="no-powerups-msg">Waiting — no action available until the question is revealed.</span>
                )}
              </div>
            </div>
          </div>
        </div>

      )}

      {/* QUESTION MODAL */}
      {gameMode === 'QUESTION' && currentQ && (
        <div className="question-modal-overlay">
          <div className="question-modal-container">
            <QuestionCard
              question={currentQ}
              difficulty={displayDifficulty}
              timeLimit={effectiveTimeLimit}
              points={stageRules.points}
              isChallenged={activePowerUp?.type === 'challenge'}
              isTimeBombed={activePowerUp?.type === 'timeBomb'}
              timeBombReduction={activePowerUp?.type === 'timeBomb' ? getTimeBombReduction(stageRules.difficulty) : 0}
              activeTeamName={answeringTeamObj.name}
              opposingTeamName={actualOpposingTeamObj.name}
              
              // Answering team's power-ups
              noEscapeAvailable={answeringTeamObj.powerUps.noEscape}
              onNoEscape={handleNoEscape}
              onSubmitAnswer={handleSubmitAnswer}
            />
          </div>
        </div>
      )}

      {/* NO ESCAPE MODAL */}
      {gameMode === 'NO_ESCAPE_QUESTION' && noEscapeData && (
        <div className="question-modal-overlay">
          <div className="question-modal-container">
            <QuestionCard
              question={noEscapeData.question}
              difficulty={noEscapeData.difficulty}
              timeLimit={stageRules.timeLimit}
              points={noEscapeData.points}
              isChallenged={false}
              isTimeBombed={false}
              timeBombReduction={0}
              activeTeamName={noEscapeData.activatingTeam === 'A' ? teamB.name : teamA.name}
              opposingTeamName={noEscapeData.activatingTeam === 'A' ? teamA.name : teamB.name}
              noEscapeAvailable={false}
              isNoEscapeTarget={true}
              noEscapeActivatorName={noEscapeData.activatingTeam === 'A' ? teamA.name : teamB.name}
              opposingPowerUps={{ challenge: false, timeBomb: false }}
              onSubmitAnswer={handleNoEscapeResult}
            />
          </div>
        </div>
      )}

      {gameMode === 'SETUP' && (
        <div className="start-screen-container">
          <div className="start-header">
            <h1>CODE CLASH</h1>
            <p>Tug of War Edition — Round 2</p>
          </div>

          <div className="rules-summary-card">
            <h3>⚡ OFFICIAL RULES</h3>
            <ul className="rules-list">
              <li><strong>Easy Phase (Q1-12):</strong> 45s timer | 1 Point</li>
              <li><strong>Medium Phase (Q13-24):</strong> 60s timer | 2 Points</li>
              <li><strong>Hard Phase (Q25-36):</strong> 90s timer | 3 Points</li>
              <li><strong>⚔️ Challenge:</strong> Upgrade opponent's question! Wrong answer = <strong>2× penalty!</strong></li>
              <li><strong>💣 TimeBomb (Med/Hard Only):</strong> Reduce opponent's timer drastically!</li>
              <li><strong>🚫 No Escape:</strong> Force opponent to answer YOUR question.</li>
              <li><strong>Knockout Win:</strong> Pull the pointer past 20 points!</li>
            </ul>
          </div>

          <div className="team-setup-grid">
            <div className="setup-team-box">
              <h4 style={{ color: 'var(--team-a-color)' }}>TEAM A NAME</h4>
              <input
                type="text"
                className="input-team-name"
                value={teamA.name}
                onChange={(e) => setTeamA({ ...teamA, name: e.target.value })}
              />
            </div>
            <div className="setup-team-box">
              <h4 style={{ color: 'var(--team-b-color)' }}>TEAM B NAME</h4>
              <input
                type="text"
                className="input-team-name"
                value={teamB.name}
                onChange={(e) => setTeamB({ ...teamB, name: e.target.value })}
              />
            </div>
          </div>

          <button className="btn-start-game" onClick={handleStartGame}>
            <Play size={24} /> ENTER THE CLASH
          </button>
        </div>
      )}

      {gameMode === 'TIE_BREAKER' && (
        <TieBreaker
          tiebreakerQuestions={questionsData.questions.tiebreaker || []}
          teamA={teamA}
          teamB={teamB}
          onFinishTieBreaker={handleFinishTieBreaker}
          onLogRound={(round) => logMatchEvent({
            turnLabel: `SD${round.round}`,
            eventType: 'TIEBREAKER',
            difficulty: null,
            answeringTeamKey: round.team,
            answeringTeamName: round.teamName,
            initiatorName: null,
            questionText: round.questionText,
            chosenAnswerText: round.chosenAnswerText,
            correctAnswerText: round.correctAnswerText,
            isCorrect: round.isCorrect,
            pointsAwardedToName: null,
            pointsAwarded: 0,
            timeTaken: round.timeTaken,
            timeLimit: round.timeLimit
          })}
        />
      )}

      {gameMode === 'GAME_OVER' && winnerInfo && (
        <div className="gameover-overlay">
          <div className="gameover-card">
            <Trophy size={72} className="trophy-gold" />
            <span className="win-method-badge">VICTORY BY {winnerInfo.method}</span>
            <h1 className="winner-announce">{winnerInfo.name.toUpperCase()} WINS!</h1>
            <div className="final-stats-grid">
              <div className="final-stat-box">
                <span className="team-sub">{teamA.name} Score</span>
                <h2>{teamA.score} pts</h2>
              </div>
              <div className="final-stat-box">
                <span className="team-sub">{teamB.name} Score</span>
                <h2>{teamB.score} pts</h2>
              </div>
            </div>
            <div className="gameover-actions-row">
              <button className="btn-secondary" onClick={() => setIsHistoryModalOpen(true)}>
                <History size={16} /> View Match History
              </button>
              <button className="btn-play-again" onClick={handleStartGame}>
                <RotateCcw size={20} /> PLAY AGAIN
              </button>
            </div>
          </div>
        </div>
      )}

      {isHistoryModalOpen && (
        <MatchHistoryModal
          matchHistory={matchHistory}
          teamA={teamA}
          teamB={teamB}
          onClose={() => setIsHistoryModalOpen(false)}
        />
      )}

      {isJsonModalOpen && (
        <JsonManagerModal
          currentQuestionsJson={questionsData}
          onSaveQuestions={(newJson) => setQuestionsData(newJson)}
          onClose={() => setIsJsonModalOpen(false)}
        />
      )}
    </div>
  );
}
