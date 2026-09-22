import React from 'react';
import { Plus, Trash2, CheckCircle2 } from 'lucide-react';
import { VerificationQuestion, AnswerType } from '../types';
import { normalizeCategory } from '../data/categories';

export interface PrivateVerificationEditorProps {
  category: string;
  questions: VerificationQuestion[];
  onChange: (questions: VerificationQuestion[]) => void;
  mode?: 'lost' | 'found';
  subtitle?: string;
}

export const CATEGORY_SUGGESTIONS: Record<
  string,
  Array<{
    question: string;
    answerType: AnswerType;
    defaultOptions?: string[];
    defaultAnswer?: string;
    importance?: 'normal' | 'important';
  }>
> = {
  wallet: [
    {
      question: 'What specific cards or IDs were inside the wallet?',
      answerType: 'text',
      defaultAnswer: 'Metro card with initials and university ID',
      importance: 'important',
    },
    {
      question: 'What initials or name are visible inside or embossed?',
      answerType: 'text',
      defaultAnswer: 'D.M.',
      importance: 'important',
    },
    {
      question: 'What was in the hidden or inner zipper compartment?',
      answerType: 'text',
      defaultAnswer: 'Small brass locker key and emergency folded bill',
      importance: 'normal',
    },
    {
      question: 'What color is the interior lining?',
      answerType: 'multiple_choice',
      defaultOptions: ['Dark green fabric', 'Classic tan leather', 'Navy blue nylon', 'Red plaid'],
      defaultAnswer: 'Dark green fabric',
      importance: 'normal',
    },
    {
      question: 'Does the wallet have a separate zippered coin pouch?',
      answerType: 'yes_no',
      defaultAnswer: 'No',
      importance: 'normal',
    },
  ],
  bag: [
    {
      question: 'What specific item was stored in the front zippered pouch?',
      answerType: 'text',
      defaultAnswer: 'Spiral dot notebook and audio headphones case',
      importance: 'important',
    },
    {
      question: 'What color is the inner fabric lining?',
      answerType: 'multiple_choice',
      defaultOptions: ['Bright safety orange', 'Charcoal grey', 'Black nylon', 'Olive green'],
      defaultAnswer: 'Bright safety orange',
      importance: 'normal',
    },
    {
      question: 'What brand or logo is on the zipper pulls or hardware?',
      answerType: 'text',
      defaultAnswer: 'YKK stamped on matte silver pulls',
      importance: 'normal',
    },
    {
      question: 'Was any keychain or carabiner attached to the bag?',
      answerType: 'yes_no',
      defaultAnswer: 'Yes',
      importance: 'normal',
    },
  ],
  phone: [
    {
      question: 'What custom text or icon is engraved on the case/device?',
      answerType: 'text',
      defaultAnswer: 'Small mountain logo engraving',
      importance: 'important',
    },
    {
      question: 'What color or style case was on the device?',
      answerType: 'multiple_choice',
      defaultOptions: ['Clear silicone case', 'Matte black shockproof', 'Tan leather folio', 'No case'],
      defaultAnswer: 'Clear silicone case',
      importance: 'normal',
    },
    {
      question: 'What is shown on the lock screen wallpaper?',
      answerType: 'text',
      defaultAnswer: 'Golden retriever on a beach',
      importance: 'important',
    },
    {
      question: 'Is there a small crack or scratch on the camera lens or bezel?',
      answerType: 'yes_no',
      defaultAnswer: 'Yes',
      importance: 'normal',
    },
  ],
  laptop: [
    {
      question: 'What stickers, skins, or distinctive markings are on the lid?',
      answerType: 'text',
      defaultAnswer: 'Octocat sticker and small national park badge',
      importance: 'important',
    },
    {
      question: 'What user account name or avatar appears on login screen?',
      answerType: 'text',
      defaultAnswer: 'Alex M with space shuttle icon',
      importance: 'important',
    },
    {
      question: 'What keyboard layout or language is installed?',
      answerType: 'multiple_choice',
      defaultOptions: ['Standard US QWERTY', 'UK English', 'Spanish', 'Custom Mechanical'],
      defaultAnswer: 'Standard US QWERTY',
      importance: 'normal',
    },
  ],
  keys: [
    {
      question: 'How many total keys are on the ring or carabiner?',
      answerType: 'multiple_choice',
      defaultOptions: ['2–3 keys', '4–5 keys', '6–8 keys', 'Over 8 keys'],
      defaultAnswer: '4–5 keys',
      importance: 'important',
    },
    {
      question: 'What distinctive novelty keychain or fob is attached?',
      answerType: 'text',
      defaultAnswer: 'Mini brass bottle opener and blue rubber gym tag',
      importance: 'important',
    },
    {
      question: 'Is there an electronic vehicle key fob on the ring?',
      answerType: 'yes_no',
      defaultAnswer: 'Yes',
      importance: 'normal',
    },
  ],
  jewelry: [
    {
      question: 'What engraving, stamp, or hallmark is on the interior?',
      answerType: 'text',
      defaultAnswer: '14K gold stamp with engraved date 06.12.21',
      importance: 'important',
    },
    {
      question: 'What kind of clasp or fastener does it feature?',
      answerType: 'multiple_choice',
      defaultOptions: ['Lobster clasp', 'Spring ring', 'Magnetic clasp', 'Box clasp with safety latch'],
      defaultAnswer: 'Lobster clasp',
      importance: 'normal',
    },
  ],
  glasses: [
    {
      question: 'What brand or model code is printed on the inner temple arm?',
      answerType: 'text',
      defaultAnswer: 'Oliver Peoples 5032',
      importance: 'important',
    },
    {
      question: 'What prescription type or lens tint is used?',
      answerType: 'multiple_choice',
      defaultOptions: ['Clear blue-light prescription', 'Progressive bifocals', 'Dark polarized tint', 'Green tint sunglasses'],
      defaultAnswer: 'Clear blue-light prescription',
      importance: 'normal',
    },
  ],
  pet: [
    {
      question: 'What exact name and phone number are on the collar tag?',
      answerType: 'text',
      defaultAnswer: 'Milo - 555-0192',
      importance: 'important',
    },
    {
      question: 'What color and pattern is the collar or harness?',
      answerType: 'text',
      defaultAnswer: 'Teal nylon with reflective silver stitching',
      importance: 'important',
    },
    {
      question: 'Does the pet have a microchip registered?',
      answerType: 'yes_no',
      defaultAnswer: 'Yes',
      importance: 'important',
    },
  ],
  id: [
    {
      question: 'What full name appears on the identification card?',
      answerType: 'text',
      defaultAnswer: 'Full legal name as printed on card',
      importance: 'important',
    },
    {
      question: 'What issuing state or university is on the document?',
      answerType: 'text',
      defaultAnswer: 'New York State DMV or Columbia University',
      importance: 'important',
    },
  ],
  other: [
    {
      question: 'What specific brand, model, or maker code is on the item?',
      answerType: 'text',
      defaultAnswer: 'Brand name or model number',
      importance: 'important',
    },
    {
      question: 'What distinctive scratch, engraving, or flaw does it have?',
      answerType: 'text',
      defaultAnswer: 'Small notch or scratch mark on base',
      importance: 'important',
    },
    {
      question: 'Where exactly was the item lost or found?',
      answerType: 'text',
      defaultAnswer: 'Second floor reading room, desk next to elevator',
      importance: 'normal',
    },
  ],
};

function getSuggestionsForCategory(cat: string) {
  const norm = normalizeCategory(cat).toLowerCase();
  if (norm.includes('wallet') || norm.includes('money')) return CATEGORY_SUGGESTIONS.wallet;
  if (norm.includes('phone') || norm.includes('tablet')) return CATEGORY_SUGGESTIONS.phone;
  if (norm.includes('laptop') || norm.includes('computer')) return CATEGORY_SUGGESTIONS.laptop;
  if (norm.includes('electronic')) return CATEGORY_SUGGESTIONS.phone;
  if (norm.includes('bag') || norm.includes('backpack')) return CATEGORY_SUGGESTIONS.bag;
  if (norm.includes('key')) return CATEGORY_SUGGESTIONS.keys;
  if (norm.includes('jewel') || norm.includes('watch')) return CATEGORY_SUGGESTIONS.jewelry;
  if (norm.includes('glass')) return CATEGORY_SUGGESTIONS.glasses;
  if (norm.includes('pet')) return CATEGORY_SUGGESTIONS.pet;
  if (norm.includes('id') || norm.includes('document')) return CATEGORY_SUGGESTIONS.id;
  return CATEGORY_SUGGESTIONS.other;
}

export const PrivateVerificationEditor: React.FC<PrivateVerificationEditorProps> = ({
  category,
  questions,
  onChange,
  mode,
  subtitle,
}) => {
  const currentCategorySuggestions = getSuggestionsForCategory(category);
  const sectionSubtitle =
    subtitle ||
    (mode === 'lost'
      ? 'Add details only the owner would know.'
      : mode === 'found'
      ? 'Add details that can help confirm the rightful owner.'
      : 'Add a few details that only the rightful owner should know.');

  const handleAddCustomQuestion = () => {
    const newQ: VerificationQuestion = {
      id: `vq-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      question: '',
      answerType: 'text',
      correctAnswer: '',
      importance: 'normal',
      weight: 1,
      isPrivate: true,
    };
    onChange([...questions, newQ]);
  };

  const handleAddSuggestedQuestion = (sug: {
    question: string;
    answerType: AnswerType;
    defaultOptions?: string[];
    defaultAnswer?: string;
    importance?: 'normal' | 'important';
  }) => {
    if (questions.some((q) => q.question.toLowerCase() === sug.question.toLowerCase())) {
      return;
    }
    const isImportant = sug.importance === 'important';
    const newQ: VerificationQuestion = {
      id: `vq-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      question: sug.question,
      answerType: sug.answerType,
      options: sug.defaultOptions ? [...sug.defaultOptions] : undefined,
      correctAnswer: sug.defaultAnswer || (sug.answerType === 'yes_no' ? 'Yes' : ''),
      importance: isImportant ? 'important' : 'normal',
      weight: isImportant ? 2 : 1,
      isPrivate: true,
    };
    onChange([...questions, newQ]);
  };

  const handleUpdateQuestion = (id: string, updates: Partial<VerificationQuestion>) => {
    onChange(
      questions.map((q) => {
        if (q.id !== id) return q;
        const updated = { ...q, ...updates };

        // Keep weight in sync with importance internally without exposing UI
        if (updates.importance) {
          updated.weight = updates.importance === 'important' ? 2 : 1;
        }

        // Ensure defaults when switching types
        if (updates.answerType && updates.answerType !== q.answerType) {
          if (updates.answerType === 'multiple_choice' && !updated.options) {
            updated.options = ['Option 1', 'Option 2'];
            updated.correctAnswer = 'Option 1';
          } else if (updates.answerType === 'yes_no') {
            updated.options = undefined;
            if (updated.correctAnswer !== 'Yes' && updated.correctAnswer !== 'No') {
              updated.correctAnswer = 'Yes';
            }
          }
        }
        return updated;
      })
    );
  };

  const handleRemoveQuestion = (id: string) => {
    onChange(questions.filter((q) => q.id !== id));
  };

  const handleAddOption = (questionId: string) => {
    onChange(
      questions.map((q) => {
        if (q.id !== questionId) return q;
        const opts = q.options ? [...q.options] : [];
        opts.push(`Option ${opts.length + 1}`);
        return { ...q, options: opts };
      })
    );
  };

  const handleUpdateOption = (questionId: string, optIndex: number, newValue: string) => {
    onChange(
      questions.map((q) => {
        if (q.id !== questionId || !q.options) return q;
        const opts = [...q.options];
        const oldValue = opts[optIndex];
        opts[optIndex] = newValue;
        let correctAnswer = q.correctAnswer;
        if (correctAnswer === oldValue) {
          correctAnswer = newValue;
        }
        return { ...q, options: opts, correctAnswer };
      })
    );
  };

  const handleRemoveOption = (questionId: string, optIndex: number) => {
    onChange(
      questions.map((q) => {
        if (q.id !== questionId || !q.options || q.options.length <= 2) return q;
        const removedValue = q.options[optIndex];
        const opts = q.options.filter((_, i) => i !== optIndex);
        let correctAnswer = q.correctAnswer;
        if (correctAnswer === removedValue) {
          correctAnswer = opts[0] || '';
        }
        return { ...q, options: opts, correctAnswer };
      })
    );
  };

  return (
    <div className="border-t border-[#1B1812]/10 pt-4 mt-2 space-y-3.5">
      {/* Section Header */}
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-[#1B1812]">
          PRIVATE VERIFICATION
        </h4>
        <p className="text-xs text-[#1B1812]/70 mt-0.5">
          {sectionSubtitle}
        </p>
      </div>

      {/* Suggested Questions based on Category */}
      {currentCategorySuggestions.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium text-[#1B1812]/60">
            Suggested questions:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {currentCategorySuggestions.map((sug, idx) => {
              const isAdded = questions.some(
                (q) => q.question.toLowerCase() === sug.question.toLowerCase()
              );
              return (
                <button
                  key={idx}
                  type="button"
                  disabled={isAdded}
                  onClick={() => handleAddSuggestedQuestion(sug)}
                  className={`text-xs px-2.5 py-1 rounded-md border text-left transition-colors flex items-center gap-1 cursor-pointer ${
                    isAdded
                      ? 'border-[#1B1812]/15 bg-[#1B1812]/5 text-[#1B1812]/40 cursor-not-allowed'
                      : 'border-[#1B1812]/20 bg-[#F6F3EC] text-[#1B1812] hover:border-[#1B1812] hover:bg-[#1B1812]/5'
                  }`}
                >
                  <span>{isAdded ? '✓' : '+'}</span>
                  <span>{sug.question}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Added Questions List */}
      <div className="space-y-3">
        {questions.length === 0 ? (
          <div className="border border-dashed border-[#1B1812]/20 rounded-lg p-3 text-center bg-[#1B1812]/[0.01]">
            <p className="text-xs text-[#1B1812]/60">No verification questions added yet</p>
          </div>
        ) : (
          questions.map((q, qIndex) => {
            return (
              <div
                key={q.id}
                className="border border-[#1B1812]/15 rounded-lg p-3 bg-[#F6F3EC] space-y-3"
              >
                {/* Header & Delete */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-[#1B1812]/70 uppercase tracking-wider">
                    Question {qIndex + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveQuestion(q.id)}
                    className="text-xs text-[#1B1812]/50 hover:text-red-700 p-1 rounded transition-colors cursor-pointer flex items-center gap-1"
                    title="Remove question"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span className="text-[11px]">Remove</span>
                  </button>
                </div>

                {/* Question Input */}
                <div>
                  <label className="block text-xs font-medium text-[#1B1812] mb-1">
                    Question
                  </label>
                  <input
                    type="text"
                    required
                    value={q.question}
                    onChange={(e) => handleUpdateQuestion(q.id, { question: e.target.value })}
                    placeholder="Select or enter a question"
                    className="w-full px-3 py-1.5 border border-[#1B1812]/20 rounded bg-transparent text-xs text-[#1B1812] focus:border-[#1B1812] focus:outline-hidden"
                  />
                </div>

                {/* Answer Input */}
                {q.answerType === 'text' && (
                  <div>
                    <label className="block text-xs font-medium text-[#1B1812] mb-1">
                      Answer
                    </label>
                    <input
                      type="text"
                      required
                      value={q.correctAnswer}
                      onChange={(e) => handleUpdateQuestion(q.id, { correctAnswer: e.target.value })}
                      placeholder="Enter correct answer"
                      className="w-full px-3 py-1.5 border border-[#1B1812]/20 rounded bg-transparent text-xs text-[#1B1812] focus:border-[#1B1812] focus:outline-hidden"
                    />
                  </div>
                )}

                {q.answerType === 'multiple_choice' && (
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-[#1B1812]">
                      Answer
                    </label>
                    <div className="space-y-1.5">
                      {(q.options || ['Option 1', 'Option 2']).map((opt, optIndex) => {
                        const isCorrect = q.correctAnswer === opt;
                        return (
                          <div key={optIndex} className="flex items-center gap-2">
                            <input
                              type="radio"
                              name={`correct-${q.id}`}
                              checked={isCorrect}
                              onChange={() => handleUpdateQuestion(q.id, { correctAnswer: opt })}
                              className="w-3.5 h-3.5 accent-[#1B1812] cursor-pointer"
                              title="Mark as correct answer"
                            />
                            <input
                              type="text"
                              value={opt}
                              onChange={(e) => handleUpdateOption(q.id, optIndex, e.target.value)}
                              className="flex-1 px-2.5 py-1 border border-[#1B1812]/20 rounded bg-transparent text-xs text-[#1B1812] focus:border-[#1B1812] focus:outline-hidden"
                              placeholder={`Option ${optIndex + 1}`}
                            />
                            {(q.options?.length || 0) > 2 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveOption(q.id, optIndex)}
                                className="text-[#1B1812]/40 hover:text-red-700 p-1 cursor-pointer"
                                title="Delete option"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddOption(q.id)}
                      className="text-xs text-[#1B1812]/70 hover:text-[#1B1812] font-medium underline flex items-center gap-1 cursor-pointer pt-0.5"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add Option</span>
                    </button>
                  </div>
                )}

                {q.answerType === 'yes_no' && (
                  <div>
                    <label className="block text-xs font-medium text-[#1B1812] mb-1.5">
                      Answer
                    </label>
                    <div className="flex gap-2">
                      {['Yes', 'No'].map((choice) => (
                        <button
                          key={choice}
                          type="button"
                          onClick={() => handleUpdateQuestion(q.id, { correctAnswer: choice })}
                          className={`flex-1 py-1.5 px-3 rounded border text-xs font-medium cursor-pointer transition-colors flex items-center justify-center gap-1.5 ${
                            q.correctAnswer === choice
                              ? 'border-[#1B1812] bg-[#1B1812] text-[#F6F3EC]'
                              : 'border-[#1B1812]/20 bg-transparent text-[#1B1812]/70 hover:border-[#1B1812]/40'
                          }`}
                        >
                          {q.correctAnswer === choice && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#E8A33D]" />
                          )}
                          <span>{choice}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Optional Answer Type Selector */}
                <div>
                  <label className="block text-xs font-medium text-[#1B1812] mb-1">
                    Answer type:
                  </label>
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[#1B1812]">
                    <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="radio"
                        name={`answerType-${q.id}`}
                        value="text"
                        checked={q.answerType === 'text'}
                        onChange={() => handleUpdateQuestion(q.id, { answerType: 'text' })}
                        className="w-3.5 h-3.5 accent-[#1B1812] cursor-pointer"
                      />
                      <span>Text</span>
                    </label>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="radio"
                        name={`answerType-${q.id}`}
                        value="yes_no"
                        checked={q.answerType === 'yes_no'}
                        onChange={() => handleUpdateQuestion(q.id, { answerType: 'yes_no' })}
                        className="w-3.5 h-3.5 accent-[#1B1812] cursor-pointer"
                      />
                      <span>Yes / No</span>
                    </label>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="radio"
                        name={`answerType-${q.id}`}
                        value="multiple_choice"
                        checked={q.answerType === 'multiple_choice'}
                        onChange={() => handleUpdateQuestion(q.id, { answerType: 'multiple_choice' })}
                        className="w-3.5 h-3.5 accent-[#1B1812] cursor-pointer"
                      />
                      <span>Multiple Choice</span>
                    </label>
                  </div>
                </div>
              </div>
            );
          })
        )}

        {/* Add Question Button */}
        <button
          type="button"
          onClick={handleAddCustomQuestion}
          className="w-full py-2 px-3 border border-dashed border-[#1B1812]/30 rounded-lg text-xs font-medium text-[#1B1812] hover:bg-[#1B1812]/5 hover:border-[#1B1812] transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5 text-[#E8A33D]" />
          <span>+ Add Question</span>
        </button>
      </div>
    </div>
  );
};
