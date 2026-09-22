import React, { useState, useMemo } from 'react';
import {
  X,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Upload,
  Send,
  MessageSquare,
  MapPin,
  Clock,
  FileCheck2,
  PackageCheck,
  Lock,
  Sparkles,
  RefreshCw,
  XCircle,
  Star,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { LostFoundItem, VerificationRole, VerificationState, VerificationQuestion } from '../types';
import { CATEGORY_SUGGESTIONS } from './PrivateVerificationEditor';
import {
  evaluateVerificationSubmission,
  VerificationEvaluationReport,
} from '../utils/verificationEngine';

interface MatchVerificationModalProps {
  item: LostFoundItem;
  role: VerificationRole; // 'claimant' if clicked "Claim as Mine", 'finder' if clicked "I Found This"
  onClose: () => void;
  onItemReturned: (itemId: string) => void;
}

// Attempt storage helpers (per-user/device + per-item)
const getStoredAttempts = (itemId: string): number => {
  try {
    const val = localStorage.getItem(`foundit_attempts_${itemId}`);
    return val ? Math.max(0, parseInt(val, 10) || 0) : 0;
  } catch {
    return 0;
  }
};

const setStoredAttempts = (itemId: string, count: number): void => {
  try {
    localStorage.setItem(`foundit_attempts_${itemId}`, count.toString());
  } catch {
    // ignore
  }
};

export const MatchVerificationModal: React.FC<MatchVerificationModalProps> = ({
  item,
  role,
  onClose,
  onItemReturned,
}) => {
  const [currentRole, setCurrentRole] = useState<VerificationRole>(role);

  // Attempt tracking state
  const [attempts, setAttempts] = useState<number>(() => getStoredAttempts(item.id));

  const [verificationState, setVerificationState] = useState<VerificationState>(() => {
    if (item.status === 'returned') return 'returned';
    const saved = getStoredAttempts(item.id);
    if (saved >= 3) return 'restricted';
    return 'required';
  });

  // Toggle for [ View Status ] in pending finder review state
  const [showStatusDetails, setShowStatusDetails] = useState<boolean>(false);

  // Fallback counterpart data if not populated
  const counterpart = item.counterpart || {
    id: `counterpart-${item.id}`,
    title: item.type === 'found' ? `Lost: ${item.title}` : `Found: ${item.title}`,
    type: item.type === 'found' ? ('lost' as const) : ('found' as const),
    location: item.location,
    timeAgo: 'Reported recently',
    imageUrl:
      item.imageUrl ||
      'https://images.unsplash.com/photo-1556742049-0a67c5574f73?auto=format&fit=crop&w=800&q=80',
    description: item.description,
  };

  // Determine effective private verification questions
  const effectiveQuestions: VerificationQuestion[] = useMemo(() => {
    if (item.verificationQuestions && item.verificationQuestions.length > 0) {
      return item.verificationQuestions;
    }
    if (counterpart?.verificationQuestions && counterpart.verificationQuestions.length > 0) {
      return counterpart.verificationQuestions;
    }
    // Fallback: category suggestions converted to questions
    const catSugs = CATEGORY_SUGGESTIONS[item.category] || CATEGORY_SUGGESTIONS.other;
    return catSugs.slice(0, 3).map((s, idx) => ({
      id: `vq-${item.id}-${idx}`,
      question: s.question,
      answerType: s.answerType,
      options: s.defaultOptions,
      correctAnswer: s.defaultAnswer || (s.answerType === 'yes_no' ? 'Yes' : ''),
      importance: s.importance || 'normal',
      weight: s.importance === 'important' ? 2 : 1,
      isPrivate: true,
    }));
  }, [item, counterpart]);

  // Dynamic answers for claimant
  const [claimantResponses, setClaimantResponses] = useState<Record<string, string>>({});

  // Real evaluation report
  const [evaluationReport, setEvaluationReport] = useState<VerificationEvaluationReport | null>(null);

  // Finder confirmation answers
  const [finderAnswers, setFinderAnswers] = useState({
    exactFoundLocation: '',
    foundTime: '',
    itemCondition: 'Good, original contents preserved',
    accessoriesAttached: '',
    identifyingDetails: '',
  });

  const [additionalPhotoPreview, setAdditionalPhotoPreview] = useState<string | null>(null);

  // Secure coordination channel state
  const [showCoordinationChat, setShowCoordinationChat] = useState<boolean>(false);
  const [messages, setMessages] = useState<Array<{ sender: 'you' | 'other'; text: string; time: string }>>([
    {
      sender: 'other',
      text:
        currentRole === 'claimant'
          ? 'Hello! FoundIt verified our reports. I have your item safely stored. When would you like to arrange pickup?'
          : 'Thank you so much for reporting this item! I was devastated when I lost it. Where would be convenient for you to meet?',
      time: 'Just now',
    },
  ]);
  const [newMessage, setNewMessage] = useState('');
  const [handoffStep, setHandoffStep] = useState<'contacted' | 'handoff_arranged' | 'returned'>('contacted');

  const primaryImage =
    item.imageUrl ||
    'https://images.unsplash.com/photo-1627123424574-724758594e93?auto=format&fit=crop&w=800&q=80';
  const counterpartImage = counterpart.imageUrl;

  // Claimant answers list for finder review screen (never reveals the correct answer)
  const claimantAnswersList = useMemo(() => {
    return effectiveQuestions.map((q) => {
      const userAns = claimantResponses[q.id];
      let displayAns = userAns;
      if (!userAns || !userAns.trim()) {
        displayAns =
          q.answerType === 'yes_no'
            ? 'Yes'
            : q.options?.[0] || 'Described during verification';
      }
      return {
        id: q.id,
        question: q.question,
        answer: displayAns,
      };
    });
  }, [effectiveQuestions, claimantResponses]);

  // Real Claimant Verification Submission
  const handleClaimantSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (attempts >= 3) {
      setVerificationState('restricted');
      return;
    }

    setVerificationState('submitted');

    // Run real evaluation
    const report = evaluateVerificationSubmission(effectiveQuestions, claimantResponses);
    setEvaluationReport(report);

    // Realistic review transitions
    setTimeout(() => {
      setVerificationState('reviewing');
    }, 700);

    setTimeout(() => {
      if (report.percentageScore >= 60) {
        setVerificationState('pending_finder_review');
      } else {
        const nextAtt = attempts + 1;
        setAttempts(nextAtt);
        setStoredAttempts(item.id, nextAtt);
        if (nextAtt >= 3) {
          setVerificationState('restricted');
        } else {
          setVerificationState('unsuccessful');
        }
      }
    }, 1600);
  };

  // Skip wait timer for instant testing
  const handleSkipWait = () => {
    const report =
      evaluationReport || evaluateVerificationSubmission(effectiveQuestions, claimantResponses);
    setEvaluationReport(report);
    if (report.percentageScore >= 60) {
      setVerificationState('pending_finder_review');
    } else {
      const nextAtt = attempts + 1;
      setAttempts(nextAtt);
      setStoredAttempts(item.id, nextAtt);
      if (nextAtt >= 3) {
        setVerificationState('restricted');
      } else {
        setVerificationState('unsuccessful');
      }
    }
  };

  const handleFinderAccept = () => {
    setVerificationState('claim_accepted');
  };

  const handleFinderReject = () => {
    const nextAtt = attempts + 1;
    setAttempts(nextAtt);
    setStoredAttempts(item.id, nextAtt);
    if (nextAtt >= 3) {
      setVerificationState('restricted');
    } else {
      setVerificationState('claim_rejected');
    }
  };

  const handleRetry = () => {
    if (attempts >= 3) {
      setVerificationState('restricted');
    } else {
      setVerificationState('required');
    }
  };

  const handleResetAttempts = () => {
    setAttempts(0);
    setStoredAttempts(item.id, 0);
    setVerificationState('required');
  };

  const handleFinderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setVerificationState('submitted');

    setTimeout(() => {
      setVerificationState('reviewing');
    }, 700);

    setTimeout(() => {
      setVerificationState('claim_accepted');
    }, 1600);
  };

  // Demo helpers for testing
  const handleFillDemo = (mode: 'correct' | 'partial' | 'wrong') => {
    const newResponses: Record<string, string> = {};

    effectiveQuestions.forEach((q, idx) => {
      if (mode === 'correct') {
        newResponses[q.id] = q.correctAnswer;
      } else if (mode === 'wrong') {
        if (q.answerType === 'yes_no') {
          newResponses[q.id] = q.correctAnswer.toLowerCase() === 'yes' ? 'No' : 'Yes';
        } else if (q.answerType === 'multiple_choice') {
          const wrongOpt = q.options?.find((o) => o !== q.correctAnswer) || 'Incorrect Option';
          newResponses[q.id] = wrongOpt;
        } else {
          newResponses[q.id] = 'Completely mismatched detail';
        }
      } else {
        // Partial: 75% match
        if (idx === 0 || idx % 2 === 0) {
          newResponses[q.id] = q.correctAnswer;
        } else {
          newResponses[q.id] = 'Unrelated detail';
        }
      }
    });

    setClaimantResponses(newResponses);
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    setMessages((prev) => [
      ...prev,
      {
        sender: 'you',
        text: newMessage.trim(),
        time: 'Just now',
      },
    ]);
    setNewMessage('');

    // Simulate response
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          sender: 'other',
          text:
            currentRole === 'claimant'
              ? 'Sounds great! I can meet you at the designated community pickup point (Central Library security desk).'
              : 'Perfect, that time works for me. Thank you again!',
          time: 'Just now',
        },
      ]);
    }, 1400);
  };

  const handleMarkReturned = () => {
    setHandoffStep('returned');
    setVerificationState('returned');
    onItemReturned(item.id);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-[#1B1812]/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
    >
      <div className="bg-[#F6F3EC] border border-[#1B1812]/20 rounded-2xl w-full max-w-3xl shadow-xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Modal Top Header with Role Switcher */}
        <div className="p-4 sm:p-5 border-b border-[#1B1812]/10 flex flex-wrap items-center justify-between gap-3 shrink-0 bg-[#F6F3EC]">
          <div className="flex items-center gap-2.5">
            <span className="px-2.5 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider bg-[#E8A33D]/20 text-[#1B1812] border border-[#E8A33D]/40">
              POSSIBLE MATCH
            </span>
            <span className="text-xs text-[#1B1812]/50">•</span>
            {/* Perspective Switcher for Testing */}
            <div className="flex items-center bg-[#1B1812]/5 p-0.5 rounded border border-[#1B1812]/10 text-xs">
              <button
                type="button"
                onClick={() => {
                  setCurrentRole('claimant');
                  if (verificationState !== 'returned' && verificationState !== 'claim_accepted') {
                    if (attempts >= 3) setVerificationState('restricted');
                  }
                }}
                className={`px-2.5 py-1 rounded transition-colors cursor-pointer font-medium ${
                  currentRole === 'claimant'
                    ? 'bg-[#1B1812] text-[#F6F3EC]'
                    : 'text-[#1B1812]/60 hover:text-[#1B1812]'
                }`}
              >
                Claim as Mine (Owner)
              </button>
              <button
                type="button"
                onClick={() => {
                  setCurrentRole('finder');
                }}
                className={`px-2.5 py-1 rounded transition-colors cursor-pointer font-medium ${
                  currentRole === 'finder'
                    ? 'bg-[#1B1812] text-[#F6F3EC]'
                    : 'text-[#1B1812]/60 hover:text-[#1B1812]'
                }`}
              >
                I Found This (Finder)
              </button>
            </div>
          </div>

          <button
            type="button"
            id="close-match-modal-btn"
            onClick={onClose}
            className="p-1.5 rounded-full text-[#1B1812]/50 hover:text-[#1B1812] hover:bg-[#1B1812]/5 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1 text-sm text-[#1B1812]">
          {/* Potential Match Screen: Side-by-Side Images & AI Similarity vs Verification Signals */}
          <div className="border border-[#1B1812]/12 rounded-xl p-4 sm:p-5 bg-[#F6F3EC] space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Lost Item Photo */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#1B1812]/60">
                    {item.type === 'lost' ? 'Lost Item Photo' : 'Found Item Photo'}
                  </span>
                  <span className="text-[11px] text-[#1B1812]/50">{item.timeAgo}</span>
                </div>
                <div className="aspect-4/3 rounded-lg overflow-hidden border border-[#1B1812]/10 bg-neutral-100">
                  <img
                    src={primaryImage}
                    alt={item.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <h4 className="font-medium text-xs text-[#1B1812] line-clamp-1">{item.title}</h4>
                  <div className="flex items-center gap-1.5 text-[11px] text-[#1B1812]/60 mt-0.5">
                    <MapPin className="w-3 h-3 text-[#E8A33D]" />
                    <span className="truncate">{item.location}</span>
                  </div>
                </div>
              </div>

              {/* Found/Matching Item Photo */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#1B1812]/60">
                    {counterpart.type === 'found' ? 'Candidate Found Item' : 'Candidate Lost Item'}
                  </span>
                  <span className="text-[11px] text-[#1B1812]/50">{counterpart.timeAgo}</span>
                </div>
                <div className="aspect-4/3 rounded-lg overflow-hidden border border-[#1B1812]/10 bg-neutral-100">
                  <img
                    src={counterpartImage}
                    alt={counterpart.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <h4 className="font-medium text-xs text-[#1B1812] line-clamp-1">
                    {counterpart.title}
                  </h4>
                  <div className="flex items-center gap-1.5 text-[11px] text-[#1B1812]/60 mt-0.5">
                    <MapPin className="w-3 h-3 text-[#E8A33D]" />
                    <span className="truncate">{counterpart.location}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* SEPARATE SIGNALS: AI MATCH vs OWNERSHIP VERIFICATION */}
            <div className="border-t border-[#1B1812]/10 pt-3.5 space-y-2.5">
              <div className="p-2.5 rounded-lg bg-[#1B1812]/[0.025] border border-[#1B1812]/10 flex items-center gap-2 text-xs text-[#1B1812]/80">
                <ShieldCheck className="w-4 h-4 text-[#E8A33D] shrink-0" />
                <span>
                  <strong>AI identifies potential matches.</strong> Private verification helps confirm ownership.
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                {/* 1. AI Visual Match */}
                <div className="p-2.5 rounded-lg border border-[#1B1812]/10 bg-[#1B1812]/[0.015] space-y-0.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[#1B1812]/60 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-[#E8A33D]" />
                    AI Visual Match
                  </div>
                  <div className="text-sm font-fraunces font-medium text-[#1B1812]">
                    {item.matchConfidence || 91}%
                  </div>
                </div>

                {/* 2. Verification Strength */}
                <div className="p-2.5 rounded-lg border border-[#1B1812]/10 bg-[#1B1812]/[0.015] space-y-0.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[#1B1812]/60 flex items-center gap-1">
                    <Lock className="w-3 h-3 text-[#E8A33D]" />
                    Verification Strength
                  </div>
                  <div className="text-sm font-fraunces font-medium text-[#1B1812]">
                    {evaluationReport ? `${evaluationReport.percentageScore}%` : 'Pending'}
                  </div>
                </div>

                {/* 3. Location */}
                <div className="p-2.5 rounded-lg border border-[#1B1812]/10 bg-[#1B1812]/[0.015] space-y-0.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[#1B1812]/60 flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-[#E8A33D]" />
                    Location
                  </div>
                  <div className="text-sm font-fraunces font-medium text-[#1B1812]">
                    Strong
                  </div>
                </div>

                {/* 4. Time */}
                <div className="p-2.5 rounded-lg border border-[#1B1812]/10 bg-[#1B1812]/[0.015] space-y-0.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[#1B1812]/60 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-[#E8A33D]" />
                    Time
                  </div>
                  <div className="text-sm font-fraunces font-medium text-[#1B1812]">
                    Strong
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* FINDER PERSPECTIVE: OWNERSHIP VERIFICATION REQUEST REVIEW */}
          {/* ========================================================================= */}
          {currentRole === 'finder' &&
            verificationState !== 'claim_accepted' &&
            verificationState !== 'returned' && (
              <div className="space-y-5 pt-1">
                {/* Header banner */}
                <div className="p-4 rounded-xl border border-[#1B1812]/15 bg-[#1B1812]/[0.02] space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-fraunces text-lg font-medium text-[#1B1812]">
                      Ownership Verification Request
                    </h3>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-[#E8A33D]/20 text-[#1B1812] border border-[#E8A33D]/40">
                      Pending Your Review
                    </span>
                  </div>
                  <p className="text-xs text-[#1B1812]/70 leading-relaxed">
                    Someone is requesting to claim the item you reported as found.
                  </p>
                </div>

                {/* Signals breakdown */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="p-2.5 rounded-lg border border-[#1B1812]/10 bg-[#1B1812]/[0.015]">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-[#1B1812]/60">AI Match</div>
                    <div className="text-base font-fraunces font-medium text-[#1B1812]">
                      {item.matchConfidence || 91}%
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg border border-[#1B1812]/10 bg-[#1B1812]/[0.015]">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-[#1B1812]/60">Verification Strength</div>
                    <div className="text-base font-fraunces font-medium text-[#1B1812]">
                      {evaluationReport ? `${evaluationReport.percentageScore}%` : '75%'}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg border border-[#1B1812]/10 bg-[#1B1812]/[0.015]">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-[#1B1812]/60">Location</div>
                    <div className="text-base font-fraunces font-medium text-[#1B1812]">Strong</div>
                  </div>
                  <div className="p-2.5 rounded-lg border border-[#1B1812]/10 bg-[#1B1812]/[0.015]">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-[#1B1812]/60">Time</div>
                    <div className="text-base font-fraunces font-medium text-[#1B1812]">Strong</div>
                  </div>
                </div>

                {/* Claimant's submitted verification answers - WITHOUT REVEALING CORRECT ANSWERS */}
                <div className="border border-[#1B1812]/12 rounded-xl p-4 bg-[#F6F3EC] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#1B1812]/70">
                      Claimant's Verification Details
                    </span>
                    <span className="text-[11px] text-[#1B1812]/50 italic">
                      Review against the item in your possession
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {claimantAnswersList.map((ca, idx) => (
                      <div
                        key={ca.id || idx}
                        className="p-3 rounded-lg border border-[#1B1812]/10 bg-[#1B1812]/[0.02] space-y-1 text-xs"
                      >
                        <div className="font-semibold text-[#1B1812]">
                          {idx + 1}. {ca.question}
                        </div>
                        <div className="flex items-start gap-1.5 text-[#1B1812]/90 font-medium pl-1">
                          <span className="text-[#E8A33D] font-bold">→</span>
                          <span className="bg-[#1B1812]/5 px-2 py-0.5 rounded text-xs font-normal">
                            "{ca.answer}"
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <p className="text-[11px] text-[#1B1812]/60 italic pt-1">
                    Security notice: Correct verification answers stored by the original reporter are never exposed. Compare the claimant's answers against the physical object you found.
                  </p>
                </div>

                {/* Action Buttons: Accept & Connect vs Reject Claim */}
                <div className="flex items-center justify-between pt-2 border-t border-[#1B1812]/10">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-xs font-medium text-[#1B1812]/70 hover:text-[#1B1812] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={handleFinderReject}
                      className="px-4 py-2 text-xs font-medium text-red-800 bg-red-950/5 border border-red-900/20 rounded hover:bg-red-950/10 cursor-pointer flex items-center gap-1.5"
                    >
                      <XCircle className="w-3.5 h-3.5 text-red-700" />
                      <span>Reject Claim</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleFinderAccept}
                      className="px-5 py-2 text-xs font-medium bg-[#1B1812] text-[#F6F3EC] rounded hover:bg-[#1B1812]/90 cursor-pointer flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#E8A33D]" />
                      <span>Accept &amp; Connect</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

          {/* ========================================================================= */}
          {/* CLAIMANT PERSPECTIVE */}
          {/* ========================================================================= */}

          {/* STATE 1: CLAIMANT VERIFICATION FORM */}
          {currentRole === 'claimant' &&
            verificationState === 'required' &&
            attempts < 3 && (
              <form onSubmit={handleClaimantSubmit} className="space-y-4 pt-1">
                <div className="border-b border-[#1B1812]/10 pb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-fraunces text-xl font-[450] text-[#1B1812]">
                      PRIVATE VERIFICATION
                    </h3>
                    <p className="text-xs text-[#1B1812]/70 mt-0.5">
                      Answer the private verification questions configured by the reporter to confirm ownership.
                    </p>
                  </div>

                  {/* DEMO TEST QUICK-FILL TOOLBAR */}
                  <div className="flex items-center gap-1 bg-[#1B1812]/5 p-1 rounded-lg border border-[#1B1812]/10 text-[10px]">
                    <span className="text-[#1B1812]/50 px-1 font-medium">Test helper:</span>
                    <button
                      type="button"
                      onClick={() => handleFillDemo('correct')}
                      className="px-2 py-0.5 rounded bg-[#F6F3EC] border border-[#1B1812]/20 hover:border-[#1B1812] text-[#1B1812] font-semibold cursor-pointer"
                      title="Fills all answers correctly (100% Score -> Passes to Finder Review)"
                    >
                      ✨ 100% Match
                    </button>
                    <button
                      type="button"
                      onClick={() => handleFillDemo('partial')}
                      className="px-2 py-0.5 rounded bg-[#F6F3EC] border border-[#1B1812]/20 hover:border-[#1B1812] text-[#1B1812] font-semibold cursor-pointer"
                      title="Fills partial answers (~75% Score -> Passes to Finder Review)"
                    >
                      ⚠️ 75% Match
                    </button>
                    <button
                      type="button"
                      onClick={() => handleFillDemo('wrong')}
                      className="px-2 py-0.5 rounded bg-[#F6F3EC] border border-[#1B1812]/20 hover:border-[#1B1812] text-[#1B1812] font-semibold cursor-pointer"
                      title="Fills wrong answers (0% Score -> Below 60% Fails Attempt)"
                    >
                      ✕ 0% Match (&lt;60%)
                    </button>
                    {attempts > 0 && (
                      <button
                        type="button"
                        onClick={handleResetAttempts}
                        className="px-2 py-0.5 rounded bg-[#F6F3EC] border border-[#1B1812]/20 hover:border-[#1B1812] text-amber-900 font-semibold cursor-pointer"
                        title="Reset attempts count for this item"
                      >
                        🔄 Reset ({attempts}/3)
                      </button>
                    )}
                  </div>
                </div>

                {/* Dynamic Private Questions configured by reporter */}
                <div className="space-y-4">
                  {effectiveQuestions.map((q, idx) => {
                    const isImportant = q.importance === 'important' || (q.weight && q.weight > 1);

                    return (
                      <div
                        key={q.id}
                        className="p-3.5 rounded-xl border border-[#1B1812]/15 bg-[#F6F3EC] space-y-2.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <label className="text-xs font-semibold text-[#1B1812] block">
                            {idx + 1}. {q.question}
                          </label>
                          {isImportant && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#E8A33D]/20 text-[#1B1812] font-medium border border-[#E8A33D]/40 flex items-center gap-1 shrink-0">
                              <Star className="w-2.5 h-2.5 fill-[#E8A33D] text-[#E8A33D]" />
                              Important (2x weight)
                            </span>
                          )}
                        </div>

                        {/* Text Question */}
                        {q.answerType === 'text' && (
                          <div>
                            <input
                              required
                              type="text"
                              value={claimantResponses[q.id] || ''}
                              onChange={(e) =>
                                setClaimantResponses({
                                  ...claimantResponses,
                                  [q.id]: e.target.value,
                                })
                              }
                              placeholder="Enter matching private details..."
                              className="w-full px-3 py-2 border border-[#1B1812]/20 rounded bg-transparent text-xs text-[#1B1812] focus:border-[#1B1812] focus:outline-hidden"
                            />
                            <p className="text-[10px] text-[#1B1812]/50 mt-1">
                              Minor spelling variations are accepted. Correct details are never revealed.
                            </p>
                          </div>
                        )}

                        {/* Yes/No Question */}
                        {q.answerType === 'yes_no' && (
                          <div className="flex gap-2">
                            {['Yes', 'No'].map((choice) => {
                              const isSelected = claimantResponses[q.id] === choice;
                              return (
                                <button
                                  key={choice}
                                  type="button"
                                  onClick={() =>
                                    setClaimantResponses({
                                      ...claimantResponses,
                                      [q.id]: choice,
                                    })
                                  }
                                  className={`flex-1 py-1.5 px-3 rounded border text-xs font-medium cursor-pointer transition-colors ${
                                    isSelected
                                      ? 'border-[#1B1812] bg-[#1B1812] text-[#F6F3EC]'
                                      : 'border-[#1B1812]/20 bg-transparent text-[#1B1812]/70 hover:border-[#1B1812]/40'
                                  }`}
                                >
                                  {choice}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* Multiple Choice Question */}
                        {q.answerType === 'multiple_choice' && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {(q.options || ['Option A', 'Option B', 'Option C']).map((opt) => {
                              const isSelected = claimantResponses[q.id] === opt;
                              return (
                                <button
                                  key={opt}
                                  type="button"
                                  onClick={() =>
                                    setClaimantResponses({
                                      ...claimantResponses,
                                      [q.id]: opt,
                                    })
                                  }
                                  className={`px-3 py-2 rounded border text-left text-xs font-medium cursor-pointer transition-colors ${
                                    isSelected
                                      ? 'border-[#1B1812] bg-[#1B1812] text-[#F6F3EC]'
                                      : 'border-[#1B1812]/20 bg-transparent text-[#1B1812]/70 hover:border-[#1B1812]/40'
                                  }`}
                                >
                                  {opt}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* 1. MANDATORY SECURITY NOTICE BEFORE VERIFICATION */}
                <div className="p-3.5 rounded-xl border border-[#1B1812]/15 bg-[#1B1812]/[0.025] space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-xs text-[#1B1812]">
                    <ShieldCheck className="w-4 h-4 text-[#E8A33D]" />
                    <span>Please answer carefully</span>
                  </div>
                  <p className="text-xs text-[#1B1812]/75 leading-relaxed">
                    These details are used to help verify that you are the rightful owner. Answer based on what you genuinely remember. Repeated unsuccessful attempts may temporarily restrict further claims.
                  </p>
                  {attempts === 1 && (
                    <div className="mt-2 text-[11px] font-medium text-amber-900 bg-amber-500/10 border border-amber-600/30 rounded p-2 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                      <span>Attempt 1 of 3 was unsuccessful. Please review your answers carefully before submitting.</span>
                    </div>
                  )}
                  {attempts === 2 && (
                    <div className="mt-2 text-[11px] font-medium text-red-900 bg-red-500/10 border border-red-600/30 rounded p-2 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-700 shrink-0" />
                      <span>Strong warning: Attempt 2 of 3 was unsuccessful. Only 1 attempt remaining. Please confirm all details carefully before submitting.</span>
                    </div>
                  )}
                </div>

                {/* SUBMIT BUTTON */}
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#1B1812]/10">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-xs font-medium text-[#1B1812]/70 hover:text-[#1B1812] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    id="submit-verification-btn"
                    className="px-6 py-2.5 text-xs font-medium bg-[#1B1812] text-[#F6F3EC] rounded-md hover:bg-[#1B1812]/90 cursor-pointer flex items-center gap-1.5"
                  >
                    <FileCheck2 className="w-4 h-4 text-[#E8A33D]" />
                    <span>Submit Verification</span>
                  </button>
                </div>
              </form>
            )}

          {/* STATE 2: PROCESSING (SUBMITTED / REVIEWING) */}
          {currentRole === 'claimant' &&
            (verificationState === 'submitted' || verificationState === 'reviewing') && (
              <div className="py-8 text-center space-y-4">
                <div className="w-12 h-12 rounded-full border-2 border-[#E8A33D] border-t-transparent animate-spin mx-auto" />
                <div className="space-y-1.5">
                  <h3 className="font-fraunces text-2xl font-[450] text-[#1B1812]">
                    Evaluating verification details...
                  </h3>
                  <p className="text-xs text-[#1B1812]/70 max-w-md mx-auto leading-relaxed">
                    Your submitted details are being cross-referenced against the private verification
                    parameters and weighted importance scores.
                  </p>
                  <p className="text-[11px] text-[#1B1812]/50 italic">
                    Calculating overall verification score and preparing private handoff data...
                  </p>
                </div>

                {/* Fast-advance button for testing */}
                <button
                  type="button"
                  onClick={handleSkipWait}
                  className="text-xs font-medium text-[#1B1812]/50 hover:text-[#1B1812] underline pt-2 cursor-pointer"
                >
                  Skip review wait (Evaluate instantly)
                </button>
              </div>
            )}

          {/* STATE 3: VERIFICATION SUBMITTED (>= 60% SCORE) -> SENT TO FINDER REVIEW */}
          {currentRole === 'claimant' && verificationState === 'pending_finder_review' && (
            <div className="space-y-5 pt-1">
              {/* Main Banner */}
              <div className="p-4 rounded-xl border border-[#E8A33D]/40 bg-[#E8A33D]/10 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-[#E8A33D] shrink-0 mt-0.5" />
                <div className="space-y-1 flex-1">
                  <h3 className="font-fraunces text-lg font-medium text-[#1B1812]">
                    ✓ Verification Submitted
                  </h3>
                  <p className="text-xs text-[#1B1812]/80 leading-relaxed font-medium">
                    Your submitted details provide enough evidence to continue the verification process.
                  </p>
                  <p className="text-xs text-[#1B1812]/70 leading-relaxed pt-0.5">
                    Your verification details have been sent privately to the person who reported/found the item for review.
                  </p>
                </div>
              </div>

              {/* Signals Breakdown */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-2.5 rounded-lg border border-[#1B1812]/10 bg-[#1B1812]/[0.015]">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[#1B1812]/60">AI Match</div>
                  <div className="text-base font-fraunces font-medium text-[#1B1812]">
                    {item.matchConfidence || 91}%
                  </div>
                </div>
                <div className="p-2.5 rounded-lg border border-[#1B1812]/10 bg-[#1B1812]/[0.015]">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[#1B1812]/60">Verification Strength</div>
                  <div className="text-base font-fraunces font-medium text-[#1B1812]">
                    {evaluationReport ? `${evaluationReport.percentageScore}%` : '75%'}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg border border-[#1B1812]/10 bg-[#1B1812]/[0.015]">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[#1B1812]/60">Location</div>
                  <div className="text-base font-fraunces font-medium text-[#1B1812]">Strong</div>
                </div>
                <div className="p-2.5 rounded-lg border border-[#1B1812]/10 bg-[#1B1812]/[0.015]">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[#1B1812]/60">Time</div>
                  <div className="text-base font-fraunces font-medium text-[#1B1812]">Strong</div>
                </div>
              </div>

              {/* Status Stepper: 1. Verification Submitted -> 2. Finder Review -> 3. Approved / Rejected */}
              <div className="border border-[#1B1812]/10 rounded-xl p-4 bg-[#F6F3EC] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#1B1812]/70">
                    Verification Lifecycle Status
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowStatusDetails(!showStatusDetails)}
                    className="text-xs text-[#1B1812]/70 hover:text-[#1B1812] flex items-center gap-1 underline cursor-pointer"
                  >
                    <span>{showStatusDetails ? 'Hide Details' : 'View Status'}</span>
                    {showStatusDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                  {/* Step 1: Verification Submitted (Complete) */}
                  <div className="p-3 rounded-lg border border-[#E8A33D]/60 bg-[#E8A33D]/10 flex items-center gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-[#E8A33D] shrink-0" />
                    <div>
                      <div className="font-semibold text-[#1B1812]">1. Verification Submitted</div>
                      <div className="text-[10px] text-[#1B1812]/60">Completed</div>
                    </div>
                  </div>

                  {/* Step 2: Finder Review (Active) */}
                  <div className="p-3 rounded-lg border border-[#1B1812] bg-[#1B1812] text-[#F6F3EC] flex items-center gap-2.5">
                    <div className="w-4 h-4 rounded-full border-2 border-[#E8A33D] border-t-transparent animate-spin shrink-0" />
                    <div>
                      <div className="font-semibold text-[#F6F3EC]">2. Finder Review</div>
                      <div className="text-[10px] text-[#F6F3EC]/70">In progress</div>
                    </div>
                  </div>

                  {/* Step 3: Approved / Rejected (Pending) */}
                  <div className="p-3 rounded-lg border border-[#1B1812]/15 bg-[#1B1812]/[0.02] text-[#1B1812]/60 flex items-center gap-2.5">
                    <div className="w-4 h-4 rounded-full border border-[#1B1812]/30 flex items-center justify-center text-[10px]">
                      3
                    </div>
                    <div>
                      <div className="font-semibold">3. Approved / Rejected</div>
                      <div className="text-[10px] text-[#1B1812]/40">Awaiting review</div>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-[#1B1812]/70 leading-relaxed pt-1">
                  The claimant should now wait for the other party to review the information.
                </p>

                {/* Expandable Status Details Drawer */}
                {showStatusDetails && (
                  <div className="mt-3 p-3 rounded-lg border border-[#1B1812]/10 bg-[#1B1812]/[0.02] space-y-2 text-xs text-[#1B1812]/80 animate-in fade-in duration-200">
                    <div className="font-semibold text-[#1B1812]">Claim Dispatch Details</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                      <div>• Destination: Person who reported/found the item</div>
                      <div>• Verification Data: Transferred securely &amp; encrypted</div>
                      <div>• Reporter Answers: Kept private; not disclosed</div>
                      <div>• Next Notification: When finder accepts or rejects</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer Actions: Switch to Finder to test review, or close */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-[#1B1812]/10">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium text-[#1B1812]/70 hover:text-[#1B1812] cursor-pointer"
                >
                  Close &amp; Wait for Review
                </button>
                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <button
                    type="button"
                    onClick={() => setCurrentRole('finder')}
                    className="px-4 py-2 text-xs font-medium bg-[#1B1812] text-[#F6F3EC] rounded hover:bg-[#1B1812]/90 transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <span>Switch to Finder View to Review Claim</span>
                    <span className="text-[#E8A33D]">→</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STATE 4: SUCCESSFUL FINDER REVIEW (CLAIM ACCEPTED) */}
          {verificationState === 'claim_accepted' && (
            <div className="space-y-6 pt-1">
              <div className="p-4 rounded-xl border border-[#E8A33D]/40 bg-[#E8A33D]/10 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-[#E8A33D] shrink-0 mt-0.5" />
                <div className="space-y-1 flex-1">
                  <h3 className="font-fraunces text-lg font-medium text-[#1B1812]">
                    ✓ Claim Accepted
                  </h3>
                  <p className="text-xs text-[#1B1812]/80 leading-relaxed font-medium">
                    The finder has accepted your verification request.
                  </p>
                  <p className="text-xs text-[#1B1812]/70 leading-relaxed pt-0.5">
                    Connect through the secure coordination channel to schedule a safe drop-off or pickup. Personal contact info remains private.
                  </p>
                </div>
              </div>

              {/* Action Button: Contact Finder / Contact Owner */}
              {!showCoordinationChat && (
                <div className="p-4 rounded-xl border border-[#1B1812]/15 bg-[#1B1812]/[0.02] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="font-fraunces text-sm font-medium text-[#1B1812]">
                      {currentRole === 'claimant'
                        ? 'Ready to connect with the finder?'
                        : 'Ready to connect with the owner?'}
                    </h4>
                    <p className="text-xs text-[#1B1812]/70 mt-0.5">
                      Open the secure coordination channel to schedule a safe drop-off or pickup.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCoordinationChat(true)}
                    className="px-5 py-2.5 bg-[#1B1812] text-[#F6F3EC] rounded-lg text-xs font-medium hover:bg-[#1B1812]/90 transition-colors cursor-pointer flex items-center gap-1.5 shrink-0"
                  >
                    <MessageSquare className="w-4 h-4 text-[#E8A33D]" />
                    <span>{currentRole === 'claimant' ? 'Contact Finder' : 'Contact Owner'}</span>
                  </button>
                </div>
              )}

              {/* Secure Coordination Channel (Chat & Handoff Steps) */}
              {(showCoordinationChat || handoffStep === 'returned') && (
                <div className="border border-[#1B1812]/15 rounded-xl p-5 bg-[#F6F3EC] space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#1B1812]/10 pb-3">
                    <div>
                      <h4 className="font-fraunces text-base font-medium text-[#1B1812]">
                        Secure Coordination Channel
                      </h4>
                      <p className="text-xs text-[#1B1812]/70">
                        {currentRole === 'claimant'
                          ? 'Coordinate with the finder to safely retrieve your item.'
                          : 'Coordinate with the verified owner to arrange the return.'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-[#1B1812]/60 bg-[#1B1812]/5 px-2.5 py-1 rounded">
                      <Lock className="w-3.5 h-3.5 text-[#E8A33D]" />
                      <span>Private &amp; Anonymous</span>
                    </div>
                  </div>

                  {/* Handoff Status Steps */}
                  <div className="flex items-center gap-2 text-xs font-medium">
                    <button
                      type="button"
                      onClick={() => setHandoffStep('contacted')}
                      className={`px-3 py-1 rounded border transition-colors cursor-pointer ${
                        handoffStep === 'contacted'
                          ? 'border-[#1B1812] bg-[#1B1812] text-[#F6F3EC]'
                          : 'border-[#1B1812]/20 text-[#1B1812]/70'
                      }`}
                    >
                      1. Contacted
                    </button>
                    <span className="text-[#1B1812]/30">→</span>
                    <button
                      type="button"
                      onClick={() => setHandoffStep('handoff_arranged')}
                      className={`px-3 py-1 rounded border transition-colors cursor-pointer ${
                        handoffStep === 'handoff_arranged'
                          ? 'border-[#1B1812] bg-[#1B1812] text-[#F6F3EC]'
                          : 'border-[#1B1812]/20 text-[#1B1812]/70'
                      }`}
                    >
                      2. Handoff Arranged
                    </button>
                    <span className="text-[#1B1812]/30">→</span>
                    <button
                      type="button"
                      onClick={handleMarkReturned}
                      className={`px-3 py-1 rounded border transition-colors cursor-pointer ${
                        handoffStep === 'returned'
                          ? 'border-[#E8A33D] bg-[#E8A33D] text-[#1B1812] font-semibold'
                          : 'border-[#1B1812]/20 text-[#1B1812]/70'
                      }`}
                    >
                      3. Item Returned
                    </button>
                  </div>

                  {/* Chat message thread */}
                  <div className="border border-[#1B1812]/10 rounded-lg p-3 bg-[#1B1812]/[0.02] max-h-48 overflow-y-auto space-y-2.5 text-xs">
                    {messages.map((m, idx) => (
                      <div
                        key={idx}
                        className={`flex flex-col ${
                          m.sender === 'you' ? 'items-end' : 'items-start'
                        }`}
                      >
                        <div
                          className={`p-2.5 rounded-lg max-w-[85%] leading-relaxed ${
                            m.sender === 'you'
                              ? 'bg-[#1B1812] text-[#F6F3EC]'
                              : 'bg-[#F6F3EC] border border-[#1B1812]/15 text-[#1B1812]'
                          }`}
                        >
                          {m.text}
                        </div>
                        <span className="text-[10px] text-[#1B1812]/40 mt-0.5 px-1">{m.time}</span>
                      </div>
                    ))}
                  </div>

                  {/* Message input */}
                  <form onSubmit={handleSendMessage} className="flex gap-2">
                    <input
                      type="text"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      placeholder="Suggest safe public meeting spot or locker drop-off..."
                      className="flex-1 px-3 py-2 text-xs border border-[#1B1812]/20 rounded bg-transparent focus:border-[#1B1812] focus:outline-hidden"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 bg-[#1B1812] text-[#F6F3EC] rounded text-xs font-medium hover:bg-[#1B1812]/90 transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <Send className="w-3.5 h-3.5 text-[#E8A33D]" />
                      <span>Send</span>
                    </button>
                  </form>

                  {/* Return Confirmed Callout */}
                  {handoffStep === 'returned' && (
                    <div className="p-3.5 rounded-lg bg-[#E8A33D]/20 border border-[#E8A33D] flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2">
                        <PackageCheck className="w-4 h-4 text-[#1B1812]" />
                        <span className="font-semibold text-[#1B1812]">✓ ITEM RETURNED</span>
                      </div>
                      <span className="text-[#1B1812]/70">
                        Listing updated to RETURNED in public directory.
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Action buttons footer */}
              <div className="flex items-center justify-between pt-2 border-t border-[#1B1812]/10">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium text-[#1B1812]/70 hover:text-[#1B1812] cursor-pointer"
                >
                  Close
                </button>
                {handoffStep !== 'returned' && (
                  <button
                    type="button"
                    onClick={handleMarkReturned}
                    className="px-5 py-2.5 text-xs font-medium bg-[#1B1812] text-[#F6F3EC] rounded hover:bg-[#1B1812]/90 transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4 text-[#E8A33D]" />
                    <span>Confirm Item Returned to Owner</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* STATE 5: REJECTED CLAIM (FINDER REJECTED) */}
          {verificationState === 'claim_rejected' && (
            <div className="space-y-5 pt-1">
              <div className="p-4 rounded-xl border border-red-900/20 bg-red-950/5 flex items-start gap-3">
                <XCircle className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
                <div className="space-y-1 flex-1">
                  <h3 className="font-fraunces text-lg font-medium text-[#1B1812]">
                    Claim Not Accepted
                  </h3>
                  <p className="text-xs text-[#1B1812]/80 leading-relaxed">
                    The finder could not confirm the submitted ownership details.
                  </p>
                  <p className="text-[11px] text-[#1B1812]/60 pt-0.5">
                    For security reasons, we don't reveal which verification details matched or did not match.
                  </p>
                </div>
              </div>

              {/* Attempt tracking notice */}
              {attempts < 3 ? (
                <div className="p-4 rounded-xl border border-[#1B1812]/10 bg-[#F6F3EC] space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-[#1B1812]/70">
                    Attempt Status
                  </div>
                  <p className="text-xs text-[#1B1812]/80">
                    {attempts === 1
                      ? 'Attempt 1 of 3 was unsuccessful. You may review your answers carefully and try again.'
                      : 'Attempt 2 of 3 was unsuccessful. Strong warning: Only 1 attempt remaining. Take time to recall precise details before submitting.'}
                  </p>
                  <div className="flex items-center justify-between pt-2 border-t border-[#1B1812]/10">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 text-xs font-medium text-[#1B1812]/70 hover:text-[#1B1812] cursor-pointer"
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      onClick={handleRetry}
                      className="px-5 py-2 text-xs font-medium bg-[#1B1812] text-[#F6F3EC] rounded hover:bg-[#1B1812]/90 cursor-pointer flex items-center gap-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-[#E8A33D]" />
                      <span>Review Answers &amp; Try Again</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl border border-red-900/20 bg-red-950/5 space-y-2 text-xs text-[#1B1812]">
                  <div className="font-semibold text-red-900">
                    Further verification attempts are temporarily restricted.
                  </div>
                  <p className="text-[#1B1812]/80">
                    This restriction helps protect item owners from repeated guessing.
                  </p>
                  <div className="flex items-center justify-between pt-2 border-t border-red-900/10">
                    <button
                      type="button"
                      onClick={handleResetAttempts}
                      className="text-xs text-[#1B1812]/60 hover:text-[#1B1812] underline cursor-pointer"
                    >
                      Reset Attempts (Testing Helper)
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 text-xs font-medium bg-[#1B1812] text-[#F6F3EC] rounded hover:bg-[#1B1812]/90 cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STATE 6: VERIFICATION COULD NOT BE CONFIRMED (< 60% SCORE) */}
          {/* CRITICAL: NO INDIVIDUAL QUESTIONS OR WRONG ANSWERS ARE REVEALED */}
          {verificationState === 'unsuccessful' && (
            <div className="space-y-5 pt-1">
              <div className="p-4 rounded-xl border border-red-900/20 bg-red-950/5 flex items-start gap-3">
                <XCircle className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
                <div className="space-y-1 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-fraunces text-lg font-medium text-[#1B1812]">
                      Verification Could Not Be Confirmed
                    </h3>
                    {evaluationReport && (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-red-900/10 text-red-800 border border-red-900/20">
                        {evaluationReport.percentageScore}% Verification Strength
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#1B1812]/80 leading-relaxed">
                    The information provided was not sufficient to establish ownership.
                  </p>
                  <p className="text-[11px] text-[#1B1812]/60 pt-0.5">
                    For security reasons, we don't reveal which verification details matched or did not match.
                  </p>
                </div>
              </div>

              {/* Signals breakdown (No individual questions!) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-2.5 rounded-lg border border-[#1B1812]/10 bg-[#1B1812]/[0.015]">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[#1B1812]/60">AI Match</div>
                  <div className="text-base font-fraunces font-medium text-[#1B1812]">
                    {item.matchConfidence || 91}%
                  </div>
                </div>
                <div className="p-2.5 rounded-lg border border-[#1B1812]/10 bg-[#1B1812]/[0.015]">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[#1B1812]/60">Verification Strength</div>
                  <div className="text-base font-fraunces font-medium text-[#1B1812]">
                    {evaluationReport ? `${evaluationReport.percentageScore}%` : '0%'}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg border border-[#1B1812]/10 bg-[#1B1812]/[0.015]">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[#1B1812]/60">Location</div>
                  <div className="text-base font-fraunces font-medium text-[#1B1812]">Strong</div>
                </div>
                <div className="p-2.5 rounded-lg border border-[#1B1812]/10 bg-[#1B1812]/[0.015]">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[#1B1812]/60">Time</div>
                  <div className="text-base font-fraunces font-medium text-[#1B1812]">Strong</div>
                </div>
              </div>

              {/* Attempt tracking */}
              {attempts < 3 ? (
                <div className="p-4 rounded-xl border border-[#1B1812]/10 bg-[#F6F3EC] space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-[#1B1812]/70">
                    Attempt Status
                  </div>
                  <p className="text-xs text-[#1B1812]/80">
                    {attempts === 1
                      ? 'Attempt 1 of 3 was unsuccessful. Allow another attempt with careful review.'
                      : 'Attempt 2 of 3 was unsuccessful. Strong warning: Only 1 attempt remaining. Please carefully review your information before retrying.'}
                  </p>
                  <div className="flex items-center justify-between pt-2 border-t border-[#1B1812]/10">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 text-xs font-medium text-[#1B1812]/70 hover:text-[#1B1812] cursor-pointer"
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      onClick={handleRetry}
                      className="px-5 py-2 text-xs font-medium bg-[#1B1812] text-[#F6F3EC] rounded hover:bg-[#1B1812]/90 cursor-pointer flex items-center gap-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-[#E8A33D]" />
                      <span>Review Answers &amp; Try Again</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl border border-red-900/20 bg-red-950/5 space-y-2 text-xs text-[#1B1812]">
                  <div className="font-semibold text-red-900">
                    Further verification attempts are temporarily restricted.
                  </div>
                  <p className="text-[#1B1812]/80">
                    This restriction helps protect item owners from repeated guessing.
                  </p>
                  <div className="flex items-center justify-between pt-2 border-t border-red-900/10">
                    <button
                      type="button"
                      onClick={handleResetAttempts}
                      className="text-xs text-[#1B1812]/60 hover:text-[#1B1812] underline cursor-pointer"
                    >
                      Reset Attempts (Testing Helper)
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 text-xs font-medium bg-[#1B1812] text-[#F6F3EC] rounded hover:bg-[#1B1812]/90 cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STATE 7: ATTEMPTS RESTRICTED (3+ FAILED ATTEMPTS) */}
          {verificationState === 'restricted' && (
            <div className="space-y-4 pt-1">
              <div className="p-5 rounded-xl border border-red-900/20 bg-red-950/5 space-y-3">
                <div className="flex items-center gap-2">
                  <XCircle className="w-5 h-5 text-red-700 shrink-0" />
                  <h3 className="font-fraunces text-lg font-medium text-[#1B1812]">
                    Further verification attempts are temporarily restricted.
                  </h3>
                </div>
                <p className="text-xs text-[#1B1812]/80 leading-relaxed">
                  This restriction helps protect item owners from repeated guessing.
                </p>
                <p className="text-[11px] text-[#1B1812]/60">
                  If this is indeed your item, you may contact our moderation support desk with original proof of ownership (such as a purchase receipt, registration, or original photo evidence).
                </p>
                <div className="pt-2 flex items-center justify-between border-t border-red-900/10">
                  <button
                    type="button"
                    onClick={handleResetAttempts}
                    className="text-xs text-[#1B1812]/60 hover:text-[#1B1812] underline cursor-pointer"
                  >
                    Reset Attempts (Testing Helper)
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-xs font-medium bg-[#1B1812] text-[#F6F3EC] rounded hover:bg-[#1B1812]/90 cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STATE 8: RETURNED */}
          {verificationState === 'returned' && (
            <div className="space-y-5 pt-1">
              <div className="p-4 rounded-xl border border-[#E8A33D] bg-[#E8A33D]/20 flex items-center gap-3">
                <PackageCheck className="w-6 h-6 text-[#1B1812] shrink-0" />
                <div>
                  <h3 className="font-fraunces text-base font-semibold text-[#1B1812]">
                    ✓ Item Returned to Verified Owner
                  </h3>
                  <p className="text-xs text-[#1B1812]/80 mt-0.5">
                    This match was successfully verified, coordinated, and handoff confirmed.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end pt-2 border-t border-[#1B1812]/10">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2 text-xs font-medium bg-[#1B1812] text-[#F6F3EC] rounded hover:bg-[#1B1812]/90 cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MatchVerificationModal;
