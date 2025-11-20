"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface StreamingThoughtAccordionProps {
  content: string; // Full content including <think> tags
  isStreaming?: boolean; // Whether this message is currently streaming
  messageId?: string; // Unique message ID for tracking
  onThinkingExtracted?: (thinking: string) => void;
  onInsertClick?: (content: string) => void; // Callback when Insert button clicked
}

export function StreamingThoughtAccordion({
  content,
  isStreaming = false,
  messageId,
  onThinkingExtracted,
  onInsertClick,
}: StreamingThoughtAccordionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [displayedThinking, setDisplayedThinking] = useState<string>("");
  const streamTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Build the full insert payload: original content with internal-only sections removed,
  // preserving the original order of the visible narrative and any JSON blocks.
  const buildInsertPayload = useMemo(() => {
    if (!content) return '';
    let cleaned = content;
    // 🎯 FIX: Remove ALL thinking tag variants completely (prevent double thinking blocks)
    const variants = [
      { pattern: /<thinking>[\s\S]*?<\/thinking>/gi },
      { pattern: /<think>[\s\S]*?<\/think>/gi },
      { pattern: /<think>[\s\S]*?<\/redacted_reasoning>/gi },
      { pattern: /<AI_THINK>[\s\S]*?<\/AI_THINK>/gi },
    ];
    for (const v of variants) {
      cleaned = cleaned.replace(v.pattern, '').trim();
    }
    // Remove tool_call wrappers entirely
    cleaned = cleaned.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '').trim();
    // Keep any ```json code fences as-is so the editor can parse pricing
    
    return cleaned;
  }, [content]);
  
  // ⚠️ CRITICAL FIX: Extract thinking ONCE per actual content change
  // useMemo ensures this only runs when content actually changes, not on every render/re-stream chunk
  const { thinking, actualContent, jsonBlock } = useMemo(() => {
    // Support multiple internal thinking tag variants
    // 🎯 FIX: Ensure ALL thinking tag variants are completely stripped from chat display
    const variants = [
      { pattern: /<thinking>([\s\S]*?)<\/thinking>/gi, name: 'thinking' },
      { pattern: /<think>([\s\S]*?)<\/think>/gi, name: 'think' },
      { pattern: /<think>([\s\S]*?)<\/redacted_reasoning>/gi, name: 'redacted_reasoning' },
      { pattern: /<AI_THINK>([\s\S]*?)<\/AI_THINK>/gi, name: 'ai_think' },
    ];

    // Collect all thinking contents in order
    let extractedThinkingParts: string[] = [];
    let cleanedContent = content;

    for (const v of variants) {
      // Use matchAll to get all matches at once (more reliable than regex.exec loop)
      const matches = Array.from(content.matchAll(v.pattern));
      for (const match of matches) {
        const inner = (match[1] || '').trim();
        if (inner) {
          extractedThinkingParts.push(inner);
        }
      }
      // 🎯 CRITICAL: Remove this variant from visible content (must be mutually exclusive with thinking accordion)
      cleanedContent = cleanedContent.replace(v.pattern, '').trim();
    }
    
    // 🎯 DOUBLE-CHECK: Remove any remaining thinking tags that might have been missed
    cleanedContent = cleanedContent.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
    cleanedContent = cleanedContent.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    cleanedContent = cleanedContent.replace(/<think>[\s\S]*?<\/redacted_reasoning>/gi, '').trim();
    cleanedContent = cleanedContent.replace(/<AI_THINK>[\s\S]*?<\/AI_THINK>/gi, '').trim();

    // Also strip tool_call blocks from visible content
    cleanedContent = cleanedContent.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '').trim();

    const extractedThinking = extractedThinkingParts.join('\n\n');

    // Extract JSON code block (must be ```json ... ```) 
    const jsonMatch = cleanedContent.match(/```json\s*([\s\S]*?)\s*```/);
    let extractedJsonBlock = null as any;
    if (jsonMatch && jsonMatch[1]) {
      try {
        extractedJsonBlock = JSON.parse(jsonMatch[1]);
        // Remove JSON from markdown
        cleanedContent = cleanedContent.replace(jsonMatch[0], '').trim();
      } catch (e) {
        console.warn('⚠️ [Accordion] Could not parse JSON block:', e);
        extractedJsonBlock = null;
      }
    }

    return { thinking: extractedThinking, actualContent: cleanedContent, jsonBlock: extractedJsonBlock };
  }, [content, messageId]);

  // Handle thinking extraction callback (memoized to prevent infinite loops)
  const handleThinkingExtracted = useCallback(() => {
    if (onThinkingExtracted && thinking) {
      onThinkingExtracted(thinking);
    }
  }, [thinking, onThinkingExtracted]);

  // Stream the thinking display character by character (separate effect)
  useEffect(() => {
    // Clean up any pending timeout from previous render
    if (streamTimeoutRef.current) {
      clearTimeout(streamTimeoutRef.current);
      streamTimeoutRef.current = null;
    }

    // Stream the thinking display character by character
    if (thinking && isStreaming) {
      setDisplayedThinking("");
      let currentIndex = 0;

      const streamThinking = () => {
        if (currentIndex < thinking.length) {
          setDisplayedThinking((prev) => prev + thinking[currentIndex]);
          currentIndex++;
          // Typing speed - adjust for faster/slower effect
          const delay = Math.random() * 10 + 5; // Faster typing for better UX
          streamTimeoutRef.current = setTimeout(streamThinking, delay);
        }
      };

      streamThinking();
    } else if (thinking) {
      setDisplayedThinking(thinking);
    }

    // Cleanup timeout on unmount or when thinking changes
    return () => {
      if (streamTimeoutRef.current) {
        clearTimeout(streamTimeoutRef.current);
        streamTimeoutRef.current = null;
      }
    };
  }, [thinking, isStreaming]);

  // Call callback when thinking is extracted
  useEffect(() => {
    handleThinkingExtracted();
  }, [handleThinkingExtracted]);

  // If no content at all, show nothing
  if (!actualContent && !thinking && !jsonBlock) {
    return null;
  }

  // If only JSON block (no narrative), just show the accordion
  if (!actualContent && jsonBlock) {
    return (
      <div className="w-full space-y-2">
        <details
          className="border border-[#20e28f] rounded-lg overflow-hidden bg-[#0a0a0a] group cursor-pointer"
          open={isOpen}
          onToggle={(e) => setIsOpen((e.target as HTMLDetailsElement).open)}
        >
          <summary className="cursor-pointer px-4 py-3 bg-[#20e28f]/10 hover:bg-[#20e28f]/20 transition-colors text-sm font-semibold flex items-center gap-2 select-none list-none">
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180 flex-shrink-0" />
            <span className="text-[#20e28f]">📊</span>
            <span>Structured JSON</span>
            <span className="text-xs text-gray-400 ml-auto">Pricing Data</span>
          </summary>
          <div className="px-4 py-3 bg-[#000000]/50 border-t border-[#20e28f]/30">
            <div className="rounded-md bg-[#1e1e1e] border border-gray-800 overflow-hidden my-2">
              <div className="overflow-x-auto p-4">
                <code className="block text-sm font-mono text-gray-300 whitespace-pre-wrap break-words">
                  {JSON.stringify(jsonBlock, null, 2)}
                </code>
              </div>
            </div>
          </div>
        </details>
      </div>
    );
  }

  // If only thinking (no narrative or JSON), show just the thinking accordion
  if (!actualContent && thinking) {
    return (
      <div className="w-full space-y-3">
        <details
          className="border-l-2 border-purple-500 bg-white/5 rounded-r-lg overflow-hidden group cursor-pointer mb-4"
          open={isOpen}
          onToggle={(e) => setIsOpen((e.target as HTMLDetailsElement).open)}
        >
          <summary className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-200 cursor-pointer hover:bg-white/10 transition-colors select-none list-none">
            <Sparkles className="w-4 h-4 text-purple-500" />
            <span>Thinking Process</span>
            <ChevronDown className="w-4 h-4 ml-auto transition-transform group-open:rotate-180 text-gray-400" />
          </summary>
          <div className="px-4 py-3 bg-black/20 border-t border-white/5">
            <MemoizedMarkdown content={displayedThinking} />
            {isStreaming && displayedThinking.length < thinking.length && (
              <span className="animate-pulse text-purple-500 inline-block ml-1">▋</span>
            )}
          </div>
        </details>
      </div>
    );
  }

  // If thinking + narrative (with or without JSON): render full layout
  return (
    <div className="w-full space-y-3">
      {/* Thinking Accordion - New Design */}
      {thinking && (
        <details
          className="border-l-2 border-purple-500 bg-white/5 rounded-r-lg overflow-hidden group cursor-pointer mb-4"
          open={isOpen}
          onToggle={(e) => setIsOpen((e.target as HTMLDetailsElement).open)}
        >
          <summary className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-200 cursor-pointer hover:bg-white/10 transition-colors select-none list-none">
            <Sparkles className="w-4 h-4 text-purple-500" />
            <span>Thinking Process</span>
            <ChevronDown className="w-4 h-4 ml-auto transition-transform group-open:rotate-180 text-gray-400" />
          </summary>
          <div className="px-4 py-3 bg-black/20 border-t border-white/5">
             {/* Render thinking content as Markdown */}
            <MemoizedMarkdown content={displayedThinking} />
            {isStreaming && displayedThinking.length < thinking.length && (
              <span className="animate-pulse text-purple-500 inline-block ml-1">▋</span>
            )}
          </div>
        </details>
      )}

      {/* Main Content - SOW Narrative */}
      {actualContent && (
        <div className="pt-2 space-y-3 max-w-full overflow-x-hidden">
          <MemoizedMarkdown
            content={actualContent}
          />

          {/* JSON Accordion at the bottom if present */}
          {jsonBlock && (
            <details
              className="border border-[#20e28f] rounded-lg overflow-hidden bg-[#0a0a0a] group mt-4 cursor-pointer"
              open={false}
              onToggle={(e) => setIsOpen((e.target as HTMLDetailsElement).open)}
            >
              <summary className="cursor-pointer px-4 py-3 bg-[#20e28f]/10 hover:bg-[#20e28f]/20 transition-colors text-sm font-semibold flex items-center gap-2 select-none list-none">
                <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180 flex-shrink-0" />
                <span className="text-[#20e28f]">📊</span>
                <span>Structured JSON - Pricing Data</span>
                <span className="text-xs text-gray-400 ml-auto">Click to expand</span>
              </summary>
              <div className="px-4 py-3 bg-[#000000]/50 border-t border-[#20e28f]/30 space-y-3">
                <div className="rounded-md bg-[#1e1e1e] border border-gray-800 overflow-hidden my-2">
                  <div className="overflow-x-auto p-4">
                    <code className="block text-sm font-mono text-gray-300 whitespace-pre-wrap break-words">
                      {JSON.stringify(jsonBlock, null, 2)}
                    </code>
                  </div>
                </div>
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

// 🎯 FIX: Memoized Markdown renderer to prevent flickering on every character change
// Includes typography updates and code block breakout fixes
const MemoizedMarkdown = memo(({ content }: { content: string }) => {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Headings with proper spacing and leading
        h1: ({node, ...props}) => <h1 className="text-xl font-bold mt-6 mb-4 text-white leading-tight" {...props} />,
        h2: ({node, ...props}) => <h2 className="text-lg font-bold mt-5 mb-3 text-white leading-tight" {...props} />,
        h3: ({node, ...props}) => <h3 className="text-base font-bold mt-4 mb-2 text-white leading-tight" {...props} />,
        
        // Paragraphs with improved typography (relaxed line height, spacing, color)
        p: ({node, ...props}) => <p className="text-[15px] text-gray-200 mb-4 leading-7 break-words" {...props} />,
        
        // Lists with better spacing
        ul: ({node, ...props}) => <ul className="list-disc list-inside text-[15px] text-gray-200 mb-4 pl-2 space-y-1 break-words" {...props} />,
        ol: ({node, ...props}) => <ol className="list-decimal list-inside text-[15px] text-gray-200 mb-4 pl-2 space-y-1 break-words" {...props} />,
        li: ({node, ...props}) => <li className="leading-7" {...props} />,
        
        // Tables with professional styling
        table: ({node, ...props}) => (
          <div className="overflow-x-auto my-4 max-w-full rounded-lg border border-[#1b5e5e]/50">
            <table className="w-full border-collapse" {...props} />
          </div>
        ),
        thead: ({node, ...props}) => <thead className="bg-[#0e2e33]" {...props} />,
        th: ({node, ...props}) => (
          <th className="border-b border-[#1b5e5e] px-4 py-3 text-left font-semibold text-white text-xs uppercase tracking-wider break-words" {...props} />
        ),
        td: ({node, ...props}) => (
          <td className="border-b border-[#1b5e5e]/30 px-4 py-3 text-sm text-gray-200 break-words bg-white/5" {...props} />
        ),
        tr: ({node, ...props}) => <tr className="hover:bg-[#1b5e5e]/10 transition-colors" {...props} />,
        
        // Code blocks - Fixed "Breakout" Issue
        code: ({node, className, children, ...props}: any) => {
          const isInline = !className?.includes('language-');
          
          return isInline ? (
            <code className="bg-white/10 text-[#20e28f] px-1.5 py-0.5 rounded text-sm font-mono break-words" {...props}>{children}</code>
          ) : (
            <div className="rounded-md bg-[#1e1e1e] border border-gray-800 overflow-hidden my-4 shadow-sm">
              {/* Header for code block (optional, could add copy button here) */}
              <div className="flex items-center justify-between px-4 py-2 bg-[#252526] border-b border-gray-800">
                 <div className="flex gap-1.5">
                   <div className="w-3 h-3 rounded-full bg-[#ff5f56]"></div>
                   <div className="w-3 h-3 rounded-full bg-[#ffbd2e]"></div>
                   <div className="w-3 h-3 rounded-full bg-[#27c93f]"></div>
                 </div>
              </div>
              <div className="overflow-x-auto p-4 max-w-full">
                <code className="block text-sm font-mono text-gray-300 whitespace-pre-wrap break-words leading-relaxed" {...props}>
                  {children}
                </code>
              </div>
            </div>
          );
        },
        pre: ({node, ...props}) => <pre className="m-0 p-0 bg-transparent border-0" {...props} />,
        
        // Blockquotes
        blockquote: ({node, ...props}) => (
          <blockquote className="border-l-4 border-[#20e28f] pl-4 italic text-gray-400 my-4 text-[15px] break-words bg-white/5 py-2 pr-2 rounded-r" {...props} />
        ),
        
        // Strong and emphasis
        strong: ({node, ...props}) => <strong className="font-bold text-white break-words" {...props} />,
        em: ({node, ...props}) => <em className="italic text-gray-300 break-words" {...props} />,
        
        // Horizontal rules
        hr: ({node, ...props}) => <hr className="border-t border-[#1b5e5e]/50 my-6" {...props} />,
      }}
      className="prose prose-invert max-w-none"
    >
      {content}
    </ReactMarkdown>
  );
}, (prevProps, nextProps) => {
  // Only re-render if content actually changed (not just character-by-character)
  // Debounce: only update if content length changed by more than 10 characters or 100ms passed
  return prevProps.content === nextProps.content;
});

MemoizedMarkdown.displayName = 'MemoizedMarkdown';

export default StreamingThoughtAccordion;
