"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
import { ChevronDown } from "lucide-react";
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
    
    // Log payload contents for debugging
    const hasJsonBlock = /```json/i.test(cleaned);
    const hasNarrative = cleaned.replace(/```json[\s\S]*?```/gi, '').trim().length > 0;
    console.log('📦 [Accordion] buildInsertPayload:', {
      totalLength: cleaned.length,
      hasJsonBlock,
      hasNarrative,
      preview: cleaned.substring(0, 200),
    });
    
    return cleaned;
  }, [content]);
  
  // ⚠️ CRITICAL FIX: Extract thinking ONCE per actual content change
  // useMemo ensures this only runs when content actually changes, not on every render/re-stream chunk
  const { thinking, actualContent, jsonBlock } = useMemo(() => {
    console.log('🔍 [Accordion] Processing content:', {
      contentLength: content?.length || 0,
      contentPreview: content?.substring(0, 100) || '',
      hasThinkTag: content?.includes('<think>') || false,
    });
    
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
          console.log(`✅ [Accordion] Found ${v.name} tag:`, inner.substring(0, 50) + '...');
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
        console.log('✅ [Accordion] JSON block extracted:', extractedJsonBlock);
        // Remove JSON from markdown
        cleanedContent = cleanedContent.replace(jsonMatch[0], '').trim();
      } catch (e) {
        console.warn('⚠️ [Accordion] Could not parse JSON block:', e);
        extractedJsonBlock = null;
      }
    }

    if (extractedThinking) {
      console.log('🎯 [Accordion] THINKING EXTRACTED (messageId: ' + messageId + '):', {
        thinkingLength: extractedThinking.length,
        thinkingPreview: extractedThinking.substring(0, 100),
        hasThinkingContent: extractedThinking.length > 0
      });
    } else {
      console.log('⚠️ [Accordion] NO THINKING EXTRACTED (messageId: ' + messageId + ')');
    }

    console.log('📄 [Accordion] Cleaned content:', {
      cleanedLength: cleanedContent?.length || 0,
      cleanedPreview: cleanedContent?.substring(0, 100) || '',
    });

    return { thinking: extractedThinking, actualContent: cleanedContent, jsonBlock: extractedJsonBlock };
  }, [content, messageId]);

  // Handle thinking extraction callback (memoized to prevent infinite loops)
  const handleThinkingExtracted = useCallback(() => {
    if (onThinkingExtracted && thinking) {
      onThinkingExtracted(thinking);
    }
  }, [thinking, onThinkingExtracted]);

  // 📊 Lifecycle tracking: Log mount/unmount to detect redundant component creation
  useEffect(() => {
    console.log(`📊 [Accordion] MOUNTED (messageId: ${messageId})`);
    return () => {
      console.log(`📊 [Accordion] UNMOUNTED (messageId: ${messageId})`);
    };
  }, [messageId]);

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
          const delay = Math.random() * 20 + 10; // 10-30ms between chars
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
            <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap break-words max-h-[400px] overflow-y-auto">
              {JSON.stringify(jsonBlock, null, 2)}
            </pre>
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
          className="border border-[#1b5e5e] rounded-lg overflow-hidden bg-[#0a0a0a] group cursor-pointer"
          open={isOpen}
          onToggle={(e) => setIsOpen((e.target as HTMLDetailsElement).open)}
        >
          <summary className="cursor-pointer px-4 py-3 bg-[#1b5e5e]/20 hover:bg-[#1b5e5e]/30 transition-colors text-sm font-semibold flex items-center gap-2 select-none list-none">
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180 flex-shrink-0" />
            <span className="text-yellow-400">🧠</span>
            <span>
              {isStreaming ? "AI Thinking..." : "AI Reasoning"}
              {isStreaming && <span className="ml-2 inline-flex gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse"></span>
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" style={{ animationDelay: "0.2s" }}></span>
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" style={{ animationDelay: "0.4s" }}></span>
              </span>}
            </span>
            <span className="text-xs text-gray-400 ml-auto">Transparency Mode</span>
          </summary>
          <div className="px-4 py-3 bg-[#000000]/50 border-t border-[#1b5e5e]/30">
            <div className="text-xs text-gray-300 whitespace-pre-wrap font-mono leading-relaxed max-h-[300px] overflow-y-auto">
              <span>{displayedThinking}</span>
              {isStreaming && displayedThinking.length < thinking.length && (
                <span className="animate-pulse text-gray-500">_</span>
              )}
            </div>
          </div>
        </details>
      </div>
    );
  }

  // If thinking + narrative (with or without JSON): render full layout
  return (
    <div className="w-full space-y-3">
      {/* Thinking Accordion */}
      {thinking && (
        <details
          className="border border-[#1b5e5e] rounded-lg overflow-hidden bg-[#0a0a0a] group cursor-pointer"
          open={isOpen}
          onToggle={(e) => setIsOpen((e.target as HTMLDetailsElement).open)}
        >
          <summary className="cursor-pointer px-4 py-3 bg-[#1b5e5e]/20 hover:bg-[#1b5e5e]/30 transition-colors text-sm font-semibold flex items-center gap-2 select-none list-none">
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180 flex-shrink-0" />
            <span className="text-yellow-400">🧠</span>
            <span>
              {isStreaming ? "AI Thinking..." : "AI Reasoning"}
              {isStreaming && <span className="ml-2 inline-flex gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse"></span>
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" style={{ animationDelay: "0.2s" }}></span>
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" style={{ animationDelay: "0.4s" }}></span>
              </span>}
            </span>
            <span className="text-xs text-gray-400 ml-auto">Transparency Mode</span>
          </summary>
          <div className="px-4 py-3 bg-[#000000]/50 border-t border-[#1b5e5e]/30">
            <div className="text-xs text-gray-300 whitespace-pre-wrap break-words font-mono leading-relaxed max-h-[300px] overflow-y-auto overflow-x-hidden max-w-full">
              <span>{displayedThinking}</span>
              {isStreaming && displayedThinking.length < thinking.length && (
                <span className="animate-pulse text-gray-500">_</span>
              )}
            </div>
          </div>
        </details>
      )}

      {/* Main Content - SOW Narrative */}
      {actualContent && (
        <div className="pt-2 space-y-3 max-w-full overflow-x-hidden">
          <MemoizedMarkdown
            content={actualContent}
          />
              // Headings with proper spacing
              h1: ({node, ...props}) => <h1 className="text-xl font-bold mt-4 mb-2 text-white" {...props} />,
              h2: ({node, ...props}) => <h2 className="text-lg font-bold mt-3 mb-2 text-white" {...props} />,
              h3: ({node, ...props}) => <h3 className="text-base font-bold mt-2 mb-1 text-white" {...props} />,
              
              // Paragraphs with proper spacing
              p: ({node, ...props}) => <p className="text-sm text-white mb-2 leading-relaxed" {...props} />,
              
              // Lists
              ul: ({node, ...props}) => <ul className="list-disc list-inside text-sm text-white mb-2 pl-2" {...props} />,
              ol: ({node, ...props}) => <ol className="list-decimal list-inside text-sm text-white mb-2 pl-2" {...props} />,
              li: ({node, ...props}) => <li className="text-sm text-white mb-1" {...props} />,
              
              // Tables with professional styling
              table: ({node, ...props}) => (
                <div className="overflow-x-auto my-3">
                  <table className="w-full border-collapse border border-[#1b5e5e]" {...props} />
                </div>
              ),
              thead: ({node, ...props}) => <thead className="bg-[#0e2e33]" {...props} />,
              th: ({node, ...props}) => (
                <th className="border border-[#1b5e5e] px-3 py-2 text-left font-bold text-white text-xs" {...props} />
              ),
              td: ({node, ...props}) => (
                <td className="border border-[#1b5e5e] px-3 py-2 text-xs text-white" {...props} />
              ),
              tr: ({node, ...props}) => <tr className="hover:bg-[#1b5e5e]/20" {...props} />,
              
              // Code blocks
              code: ({node, className, children, ...props}: any) => {
                const isInline = !className?.includes('language-');
                const isJsonBlock = className?.includes('language-json');
                
                return isInline ? (
                  <code className="bg-[#0a0a0a] text-[#20e28f] px-2 py-1 rounded text-xs font-mono" {...props}>{children}</code>
                ) : (
                  <div className="relative group">
                    <code className={`bg-[#0a0a0a] text-[#20e28f] block p-3 rounded text-xs font-mono ${
                      isJsonBlock 
                        ? 'overflow-x-auto pr-20 mb-2 border border-[#1b5e5e]' 
                        : 'overflow-x-auto mb-2 border border-[#1b5e5e]'
                    }`} {...props}>
                      {children}
                    </code>
                  </div>
                );
              },
              pre: ({node, ...props}) => <pre className="mb-2" {...props} />,
              
              // Blockquotes
              blockquote: ({node, ...props}) => (
                <blockquote className="border-l-4 border-[#20e28f] pl-3 italic text-gray-300 my-2 text-sm" {...props} />
              ),
              
              // Strong and emphasis
              strong: ({node, ...props}) => <strong className="font-bold text-white" {...props} />,
              em: ({node, ...props}) => <em className="italic text-gray-200" {...props} />,
              
              // Horizontal rules
              hr: ({node, ...props}) => <hr className="border-t border-[#1b5e5e] my-3" {...props} />,
            }}
            className="prose prose-invert max-w-none text-sm"
          >
            {actualContent}
          </ReactMarkdown>

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
                <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap break-words max-h-[400px] overflow-y-auto overflow-x-hidden max-w-full">
                  {JSON.stringify(jsonBlock, null, 2)}
                </pre>
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

// 🎯 FIX: Memoized Markdown renderer to prevent flickering on every character change
const MemoizedMarkdown = memo(({ content }: { content: string }) => {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Headings with proper spacing
        h1: ({node, ...props}) => <h1 className="text-xl font-bold mt-4 mb-2 text-white" {...props} />,
        h2: ({node, ...props}) => <h2 className="text-lg font-bold mt-3 mb-2 text-white" {...props} />,
        h3: ({node, ...props}) => <h3 className="text-base font-bold mt-2 mb-1 text-white" {...props} />,
        
        // Paragraphs with proper spacing
        p: ({node, ...props}) => <p className="text-sm text-white mb-2 leading-relaxed break-words" {...props} />,
        
        // Lists
        ul: ({node, ...props}) => <ul className="list-disc list-inside text-sm text-white mb-2 pl-2 break-words" {...props} />,
        ol: ({node, ...props}) => <ol className="list-decimal list-inside text-sm text-white mb-2 pl-2 break-words" {...props} />,
        li: ({node, ...props}) => <li className="text-sm text-white mb-1 break-words" {...props} />,
        
        // Tables with professional styling
        table: ({node, ...props}) => (
          <div className="overflow-x-auto my-3 max-w-full">
            <table className="w-full border-collapse border border-[#1b5e5e]" {...props} />
          </div>
        ),
        thead: ({node, ...props}) => <thead className="bg-[#0e2e33]" {...props} />,
        th: ({node, ...props}) => (
          <th className="border border-[#1b5e5e] px-3 py-2 text-left font-bold text-white text-xs break-words" {...props} />
        ),
        td: ({node, ...props}) => (
          <td className="border border-[#1b5e5e] px-3 py-2 text-xs text-white break-words" {...props} />
        ),
        tr: ({node, ...props}) => <tr className="hover:bg-[#1b5e5e]/20" {...props} />,
        
        // Code blocks
        code: ({node, className, children, ...props}: any) => {
          const isInline = !className?.includes('language-');
          const isJsonBlock = className?.includes('language-json');
          
          return isInline ? (
            <code className="bg-[#0a0a0a] text-[#20e28f] px-2 py-1 rounded text-xs font-mono break-words" {...props}>{children}</code>
          ) : (
            <div className="relative group">
              <code className={`bg-[#0a0a0a] text-[#20e28f] block p-3 rounded text-xs font-mono ${
                isJsonBlock 
                  ? 'overflow-x-auto pr-20 mb-2 border border-[#1b5e5e] max-w-full break-words' 
                  : 'overflow-x-auto mb-2 border border-[#1b5e5e] max-w-full break-words'
              }`} {...props}>
                {children}
              </code>
            </div>
          );
        },
        pre: ({node, ...props}) => <pre className="mb-2 max-w-full overflow-x-hidden" {...props} />,
        
        // Blockquotes
        blockquote: ({node, ...props}) => (
          <blockquote className="border-l-4 border-[#20e28f] pl-3 italic text-gray-300 my-2 text-sm break-words" {...props} />
        ),
        
        // Strong and emphasis
        strong: ({node, ...props}) => <strong className="font-bold text-white break-words" {...props} />,
        em: ({node, ...props}) => <em className="italic text-gray-200 break-words" {...props} />,
        
        // Horizontal rules
        hr: ({node, ...props}) => <hr className="border-t border-[#1b5e5e] my-3" {...props} />,
      }}
      className="prose prose-invert max-w-none text-sm break-words whitespace-pre-wrap"
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
