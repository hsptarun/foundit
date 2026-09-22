export interface PreloaderProps {
  onComplete?: () => void;
  forcePlay?: boolean;
  onSkip?: () => void;
  reducedMotionOverride?: boolean;
}

export type ItemStatus = 'active' | 'matched' | 'claimed' | 'returned';

export type AnswerType = 'text' | 'multiple_choice' | 'yes_no';

export interface VerificationQuestion {
  id: string;
  itemId?: string; // For future database compatibility (e.g. Supabase)
  question: string;
  answerType: AnswerType;
  options?: string[]; // Used when answerType === 'multiple_choice'
  correctAnswer: string; // Stored securely for verification matching, never shown publicly
  importance?: 'normal' | 'important';
  weight?: number; // 1 for normal, 2 for important
  isPrivate?: boolean;
}

export interface LostFoundItem {
  id: string;
  title: string;
  category: string; // From expanded categories list (e.g. 'Wallet / Money', 'Phone / Tablet')
  type: 'lost' | 'found';
  location: string;
  timeAgo: string;
  status: ItemStatus;
  description: string;
  imageUrl?: string;
  reward?: string;
  matchConfidence?: number;
  verificationQuestions?: VerificationQuestion[];
  counterpart?: {
    id: string;
    title: string;
    type: 'lost' | 'found';
    location: string;
    timeAgo: string;
    imageUrl: string;
    description: string;
    verificationQuestions?: VerificationQuestion[];
  };
  handoffStatus?: 'none' | 'contacted' | 'handoff_arranged' | 'returned';
}

export type VerificationRole = 'claimant' | 'finder';

export type VerificationState =
  | 'required'
  | 'submitted'
  | 'reviewing'
  | 'pending_finder_review'
  | 'finder_review'
  | 'claim_accepted'
  | 'claim_rejected'
  | 'unsuccessful'
  | 'restricted'
  | 'returned'
  | 'verified'
  | 'needs_review'
  | 'failed';

