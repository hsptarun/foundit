import { VerificationQuestion } from '../types';

export const VERIFICATION_CONFIG = {
  PASS_THRESHOLD_PERCENTAGE: 60, // >= 60% qualifies for finder review
  AUTO_VERIFY_PERCENTAGE: 60,
  MANUAL_REVIEW_PERCENTAGE: 60,
  WEIGHTS: {
    normal: 1,
    important: 2,
  },
};

/**
 * Normalizes text for comparison by trimming, lowercasing, and stripping punctuation.
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()?"'’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Computes Levenshtein distance between two strings for minor typo tolerance.
 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1, // deletion
        dp[i][j - 1] + 1, // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }
  return dp[m][n];
}

/**
 * Intelligent comparison for text answers.
 * Ignores capitalization, punctuation, extra spacing, and allows minor typo tolerance
 * or keyword alignment, but rejects random/unrelated input.
 */
export function evaluateTextAnswer(userAnswer: string, correctAnswer: string): boolean {
  if (!userAnswer || !userAnswer.trim()) return false;

  const normUser = normalizeText(userAnswer);
  const normCorrect = normalizeText(correctAnswer);

  if (normUser === normCorrect) return true;

  // Exact substring containment
  if (normCorrect.includes(normUser) && normUser.length >= 3) return true;
  if (normUser.includes(normCorrect) && normCorrect.length >= 3) return true;

  // Levenshtein typo tolerance for single words or short phrases
  const levDist = levenshtein(normUser, normCorrect);
  const maxLen = Math.max(normUser.length, normCorrect.length);
  if (maxLen >= 5 && levDist <= 2) return true;
  if (maxLen >= 10 && levDist <= 3) return true;

  // Keyword overlap comparison for longer answers
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'in', 'on', 'with', 'at', 'of', 'for', 'is', 'it', 'to']);
  const correctTokens = normCorrect.split(' ').filter((w) => w.length > 2 && !stopWords.has(w));
  const userTokens = normUser.split(' ').filter((w) => w.length > 2 && !stopWords.has(w));

  if (correctTokens.length > 0 && userTokens.length > 0) {
    let matchedKeywords = 0;
    for (const uToken of userTokens) {
      if (
        correctTokens.some(
          (cToken) =>
            cToken === uToken ||
            cToken.includes(uToken) ||
            uToken.includes(cToken) ||
            levenshtein(cToken, uToken) <= 1
        )
      ) {
        matchedKeywords++;
      }
    }

    const overlapRatio = matchedKeywords / Math.min(correctTokens.length, userTokens.length);
    // If at least 60% of keywords match, consider it correct
    if (overlapRatio >= 0.6 && matchedKeywords >= 1) {
      return true;
    }
  }

  return false;
}

/**
 * Evaluates a single answer according to question type.
 */
export function evaluateSingleAnswer(question: VerificationQuestion, userAnswer: string | undefined): boolean {
  if (userAnswer === undefined || userAnswer === null || userAnswer.trim() === '') {
    return false;
  }

  if (question.answerType === 'yes_no') {
    return normalizeText(userAnswer) === normalizeText(question.correctAnswer);
  }

  if (question.answerType === 'multiple_choice') {
    return normalizeText(userAnswer) === normalizeText(question.correctAnswer);
  }

  // Text answer
  return evaluateTextAnswer(userAnswer, question.correctAnswer);
}

export interface QuestionEvaluationResult {
  questionId: string;
  isCorrect: boolean;
  weight: number;
  importance: 'normal' | 'important';
}

export interface VerificationEvaluationReport {
  totalQuestions: number;
  correctQuestions: number;
  earnedWeight: number;
  maxWeight: number;
  percentageScore: number;
  status: 'pending_finder_review' | 'unsuccessful' | 'verified' | 'needs_review' | 'failed';
  statusLabel: string;
  badgeTitle: string;
  summaryMessage: string;
  questionResults: QuestionEvaluationResult[];
}

/**
 * Scores claimant answers against the reporter's configured questions.
 * Employs weighted question scoring (important = 2x weight).
 */
export function evaluateVerificationSubmission(
  questions: VerificationQuestion[],
  responses: Record<string, string>
): VerificationEvaluationReport {
  if (!questions || questions.length === 0) {
    return {
      totalQuestions: 0,
      correctQuestions: 0,
      earnedWeight: 0,
      maxWeight: 0,
      percentageScore: 0,
      status: 'unsuccessful',
      statusLabel: '0% Verification Strength',
      badgeTitle: 'Verification Could Not Be Confirmed',
      summaryMessage: 'No verification parameters found for this item.',
      questionResults: [],
    };
  }

  let totalEarnedWeight = 0;
  let totalPossibleWeight = 0;
  let totalCorrect = 0;
  const questionResults: QuestionEvaluationResult[] = [];

  for (const q of questions) {
    const isImportant = q.importance === 'important' || (q.weight && q.weight > 1);
    const weight = isImportant ? VERIFICATION_CONFIG.WEIGHTS.important : VERIFICATION_CONFIG.WEIGHTS.normal;
    totalPossibleWeight += weight;

    const answer = responses[q.id];
    const isCorrect = evaluateSingleAnswer(q, answer);

    if (isCorrect) {
      totalCorrect++;
      totalEarnedWeight += weight;
    }

    questionResults.push({
      questionId: q.id,
      isCorrect,
      weight,
      importance: isImportant ? 'important' : 'normal',
    });
  }

  const percentageScore =
    totalPossibleWeight > 0 ? Math.round((totalEarnedWeight / totalPossibleWeight) * 100) : 0;

  // Outcome based on 60% verification threshold
  const passesThreshold = percentageScore >= VERIFICATION_CONFIG.PASS_THRESHOLD_PERCENTAGE;
  const status: 'pending_finder_review' | 'unsuccessful' = passesThreshold
    ? 'pending_finder_review'
    : 'unsuccessful';
  const statusLabel = `${percentageScore}% Verification Strength`;
  const badgeTitle = passesThreshold
    ? '✓ Verification Submitted'
    : 'Verification Could Not Be Confirmed';
  const summaryMessage = passesThreshold
    ? 'Your submitted details provide enough evidence to continue the verification process.'
    : 'The information provided was not sufficient to establish ownership.';

  return {
    totalQuestions: questions.length,
    correctQuestions: totalCorrect,
    earnedWeight: totalEarnedWeight,
    maxWeight: totalPossibleWeight,
    percentageScore,
    status,
    statusLabel,
    badgeTitle,
    summaryMessage,
    questionResults,
  };
}
