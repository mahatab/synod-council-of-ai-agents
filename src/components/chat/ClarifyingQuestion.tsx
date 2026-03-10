import { useState } from 'react';
import { motion } from 'framer-motion';
import { MessageCircleQuestion, Send } from 'lucide-react';
import StreamingText from './StreamingText';
import Button from '../common/Button';

interface ClarifyingQuestionProps {
  question: string;
  onAnswer: (answer: string) => void;
}

export default function ClarifyingQuestion({ question, onAnswer }: ClarifyingQuestionProps) {
  const [answer, setAnswer] = useState('');

  const handleSubmit = () => {
    if (answer.trim()) {
      onAnswer(answer.trim());
      setAnswer('');
    }
  };

  return (
    <motion.div
      className="px-6 py-5"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="rounded-[var(--radius-lg)] border-2 border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/50 p-5 border-l-[4px] border-l-emerald-500 dark:border-l-emerald-400">
        <div className="flex gap-4">
          <div className="flex-shrink-0 w-9 h-9 rounded-full bg-emerald-500 dark:bg-emerald-600 flex items-center justify-center">
            <MessageCircleQuestion size={18} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="mb-3">
              <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
                Clarifying Question
              </span>
            </div>

            <div className="clarifying-question-content text-[15px] leading-relaxed text-[var(--color-text-primary)] mb-4">
              <StreamingText content={question} />
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                placeholder="Type your answer..."
                className="flex-1 px-3 py-2 text-sm bg-[var(--color-bg-input)] border border-[var(--color-border-primary)] rounded-[var(--radius-md)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-emerald-400 dark:focus:ring-emerald-600"
                autoFocus
              />
              <Button onClick={handleSubmit} size="sm" disabled={!answer.trim()}>
                <Send size={14} />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
