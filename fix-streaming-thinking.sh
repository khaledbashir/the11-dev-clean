#!/bin/bash

# Script to fix the streaming thought accordion to prevent content display while thinking is active

echo "🔧 Fixing streaming thought accordion..."

# Get the backup file
BACKUP_FILE="/root/the11-dev-clean/frontend/components/tailwind/streaming-thought-accordion.backup.tsx"
TARGET_FILE="/root/the11-dev-clean/frontend/components/tailwind/streaming-thought-accordion.tsx"

# Create the fixed version
cat > "$TARGET_FILE" << 'EOF'
"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { ChevronDown } from "lucide-react";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from "./ui/button";

interface StreamingThoughtAccordionProps {
  content: string; // Full content including <thinking> tags
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
  const [thinkingComplete, setThinkingComplete] = useState(false);

  // Build the full insert payload: original content with internal-only sections removed,
  // preserving the original order of the visible narrative and any JSON blocks.
  const buildInsertPayload = useMemo(() => {
    if (!content) return '';
    let cleaned = content;
    // Remove internal-only blocks but leave JSON in place to preserve order
    const variants = [
      { open: /<thinking>/gi, close: /<\/thinking>/gi },
      { open: /</thinking>/gi, close: /<\/think>/gi },
      { open: /<AI_THINK>/gi, close: /<\/AI_THINK>/gi },
    ];
    for (const v of variants) {
      const regex = new RegExp(`${v.open.source}([\n\s\S]*?)${v.close.source}`, 'gi');
      cleaned = cleaned.replace(regex, '').trim();
    }
    // Remove tool_call wrappers entirely
    cleaned = cleaned.replace(/</thinking>[\s\S]*?<\/tool_call>/gi, '').trim();
    // Keep any ```json code fences as-is so the editor can parse pricing
    return cleaned;
  }, [content]);

  // ⚠️ CRITICAL FIX: Extract thinking ONCE per actual content change
  // useMemo ensures this only runs when content actually changes, not on every render/re-stream chunk
  const { thinking, actualContent, jsonBlock } = useMemo(() => {
    console.log('🔍 [Accordion] Processing content:', {
      contentLength: content?.length || 0,
      contentPreview: content?.substring(0, 100) || '',
      hasThinkTag: content?.includes('</thinking>') || false,
    });

    // Support multiple internal thinking tag variants
    // CRITICAL: Build regex patterns correctly to match thinking tags
    const variants = [
      { pattern: /<thinking>([\s\S]*?)<\/thinking>/gi, name: 'thinking' },
      { pattern: /</thinking>([\s\S]*?)<\/think>/gi, name: 'think' },
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
      // Remove this variant from visible content
      cleanedContent = cleanedContent.replace(v.pattern, '').trim();
    }

    // Also strip tool_call blocks from visible content
    cleanedContent = cleanedContent.replace(/</thinking>[\s\S]*?<\/tool_call>/gi, '').trim();

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

  // Track when thinking is complete
  useEffect(() => {
    if (thinking && isStreaming) {
      setThinkingComplete(false);
    } else if (thinking && !isStreaming) {
      setThinkingComplete(true);
    }
  }, [thinking, isStreaming]);

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
            <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap break-words max-h-[400px] overflow-y-auto mb-3">
              {JSON.stringify(jsonBlock, null, 2)}
            </pre>
          </div>
        </details>
      </div>
    );
  }

  return (
    <div className="w-full space-y-2">
      {/* Only show thinking if it exists */}
      {thinking && (
        <details
          className="border border-[#20e28f] rounded-lg overflow-hidden bg-[#0a0a0a] group cursor-pointer"
          open={isOpen}
          onToggle={(e) => setIsOpen((e.target as HTMLDetailsElement).open)}
        >
          <summary className="cursor-pointer px-4 py-3 bg-[#20e28f]/10 hover:bg-[#20e28f]/20 transition-colors text-sm font-semibold flex items-center gap-2 select-none list-none">
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180 flex-shrink-0" />
            <span className="text-yellow-400">🧠</span>
            <span>{isStreaming ? "AI Thinking..." : "AI Reasoning"}</span>
            {isStreaming &&
              <span className="ml-2 inline-flex gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse"></span>
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" style={{ animationDelay: "0.2s" }}></span>
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" style={{ animationDelay: "0.4s" }}></span>
              </span>
            }
            <span className="text-xs text-gray-400 ml-auto">Transparency Mode</span>
          </summary>
          <div className="px-4 py-3 bg-[#000000]/50 border-t border-[#20e28f]/30">
            <div className="text-xs text-gray-300 whitespace-pre-wrap font-mono leading-relaxed max-h-[300px] overflow-y-auto">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: ({node, ...props}) => <h1 className="text-base font-bold mt-2 mb-1 text-yellow-300" {...props} />,
                  h2: ({node, ...props}) => <h2 className="text-sm font-bold mt-2 mb-1 text-yellow-200" {...props} />,
                  p: ({node, ...props}) => <p className="text-xs text-gray-300 mb-2" {...props} />,
                  ul: ({node, ...props}) => <ul className="list-disc list-inside text-xs text-gray-300 mb-2 pl-2" {...props} />,
                  li: ({node, ...props}) => <li className="text-xs text-gray-300 mb-1" {...props} />,
                  strong: ({node, ...props}) => <strong className="font-bold text-yellow-400" {...props} />,
                  code: ({node, className, children, ...props}: any) => (
                    <code className="bg-black text-yellow-300 px-1 rounded-sm text-xs" {...props}>{children}</code>
                  ),
                }}
                className="prose prose-invert max-w-none"
              >
                {displayedThinking || thinking}
              </ReactMarkdown>
              {isStreaming && thinking && (
                <span className="animate-pulse text-gray-500">_</span>
              )}
            </div>
          </div>
        </details>
      )}

      {/* CRITICAL FIX: Only show content when thinking is complete or there's no thinking at all */}
      {(!thinking || thinkingComplete) && actualContent && (
        <div className="bg-[#0a0a0a] border border-[#1b5e5e] rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-[#1b5e5e]/10 border-b border-[#1b5e5e]/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-[#20e28f]">Statement of Work</span>
              </div>
              {isStreaming && (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-[#20e28f] rounded-full animate-pulse"></div>
                  <span className="text-xs text-gray-400">Generating...</span>
                </div>
              )}
            </div>
          </div>
          <div className="p-4">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({node, ...props}) => <h1 className="text-lg font-bold mt-4 mb-3 text-white border-b border-[#1b5e5e]/30 pb-2" {...props} />,
                h2: ({node, ...props}) => <h2 className="text-base font-bold mt-3 mb-2 text-white" {...props} />,
                h3: ({node, ...props}) => <h3 className="text-sm font-bold mt-2 mb-1 text-white" {...props} />,
                p: ({node, ...props}) => <p className="text-sm text-white mb-2 leading-relaxed" {...props} />,
                ul: ({node, ...props}) => <ul className="list-disc list-inside text-sm text-white mb-2 pl-2" {...props} />,
                ol: ({node, ...props}) => <ol className="list-decimal list-inside text-sm text-white mb-2 pl-2" {...props} />,
                li: ({node, ...props}) => <li className="text-sm text-white mb-1" {...props} />,
                strong: ({node, ...props}) => <strong className="font-bold text-white" {...props} />,
                em: ({node, ...props}) => <em className="italic text-gray-200" {...props} />,
                blockquote: ({node, ...props}) => (
                  <blockquote className="border-l-4 border-[#20e28f] pl-3 italic text-gray-300 my-2 text-sm" {...props} />
                ),
                code: ({node, className, children, ...props}: any) => {
                  const isInline = !className?.includes('language-');
                  return isInline ? (
                    <code className="bg-[#1b5e5e]/30 text-[#20e28f] px-2 py-1 rounded text-xs font-mono" {...props}>{children}</code>
                  ) : (
                    <pre className="bg-[#1b5e5e]/20 p-3 rounded text-xs font-mono overflow-x-auto mb-2 border border-[#1b5e5e]/30">
                      <code className="text-[#20e28f]" {...props}>{children}</code>
                    </pre>
                  );
                },
              }}
              className="prose prose-invert max-w-none text-sm"
            >
              {actualContent}
            </ReactMarkdown>
          </div>
          {onInsertClick && (
            <div className="px-4 py-3 bg-[#1b5e5e]/5 border-t border-[#1b5e5e]/30">
              <Button
                onClick={() => onInsertClick(buildInsertPayload)}
                size="sm"
                className="text-xs bg-[#1b5e5e] hover:bg-[#20e28f] text-white"
              >
                Insert to Editor
              </Button>
            </div>
          )}
        </div>
      )}

      {/* JSON Block */}
      {jsonBlock && (
        <details
          className="border border-[#20e28f] rounded-lg overflow-hidden bg-[#0a0a0a] group cursor-pointer"
          open={isOpen}
          onToggle={(e) => setIsOpen((e.target as HTMLDetailsElement).open)}
        >
          <summary className="cursor-pointer px-4 py-3 bg-[#20e28f]/10 hover:bg-[#20e28f]/20 transition-colors text-sm font-semibold flex items-center gap-2 select-none list-none">
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180 flex-shrink-0" />
            <span className="text-[#20e28f]">📊</span>
            <span>Financial Details</span>
            <span className="text-xs text-gray-400 ml-auto">Pricing Breakdown</span>
          </summary>
          <div className="px-4 py-3 bg-[#000000]/50 border-t border-[#20e28f]/30">
            <div className="space-y-3">
              {/* Scope Name */}
              {jsonBlock.scope_name && (
                <div>
                  <h4 className="text-sm font-medium text-white mb-1">{jsonBlock.scope_name}</h4>
                  {jsonBlock.scope_description && (
                    <p className="text-xs text-gray-300 mb-3">{jsonBlock.scope_description}</p>
                  )}
                </div>
              )}

              {/* Deliverables */}
              {jsonBlock.deliverables && jsonBlock.deliverables.length > 0 && (
                <div>
                  <h5 className="text-xs font-medium text-white mb-2">Deliverables</h5>
                  <ul className="text-xs text-gray-300 space-y-1">
                    {jsonBlock.deliverables.map((deliverable: string, idx: number) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-[#20e28f] mt-1">•</span>
                        <span>{deliverable}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Role Allocation */}
              {jsonBlock.role_allocation && jsonBlock.role_allocation.length > 0 && (
                <div>
                  <h5 className="text-xs font-medium text-white mb-2">Resource Allocation</h5>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-[#1b5e5e]/30">
                          <th className="text-left py-2 text-gray-300 font-medium">Role</th>
                          <th className="text-right py-2 text-gray-300 font-medium">Hours</th>
                          <th className="text-right py-2 text-gray-300 font-medium">Rate</th>
                          <th className="text-right py-2 text-gray-300 font-medium">Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {jsonBlock.role_allocation.map((role: any, idx: number) => (
                          <tr key={idx} className="border-b border-[#1b5e5e]/10">
                            <td className="py-2 text-white text-left">{role.role}</td>
                            <td className="py-2 text-right text-gray-300">{role.hours}</td>
                            <td className="py-2 text-right text-gray-300">${role.rate?.toFixed(2)}</td>
                            <td className="py-2 text-right text-white font-medium">${role.cost?.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Financial Summary */}
              <div className="bg-[#1b5e5e]/10 rounded p-3 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-300">Subtotal:</span>
                  <span className="text-white">${(jsonBlock.scope_subtotal || 0).toLocaleString('en-AU', { minimumFractionDigits: 2 })}</span>
                </div>
                {jsonBlock.discount_percent > 0 && (
                  <>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-300">Discount ({jsonBlock.discount_percent}%):</span>
                      <span className="text-red-400">-${(jsonBlock.discount_amount || 0).toLocaleString('en-AU', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-300">After Discount:</span>
                      <span className="text-white">${(jsonBlock.subtotal_after_discount || 0).toLocaleString('en-AU', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </>
                )}
                {jsonBlock.gst_percent && (
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-300">GST ({jsonBlock.gst_percent}%):</span>
                    <span className="text-white">${(jsonBlock.gst_amount || 0).toLocaleString('en-AU', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-medium pt-2 border-t border-[#1b5e5e]/30">
                  <span className="text-[#20e28f]">Total:</span>
                  <span className="text-[#20e28f] font-bold">${(jsonBlock.scope_total || 0).toLocaleString('en-AU', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>
          </div>
        </details>
      )}
    </div>
  );
}

export default StreamingThoughtAccordion;
EOF

echo "✅ Fixed streaming thought accordion to prevent content display while thinking is active"
echo "🔧 Key changes made:"
echo "  - Added thinkingComplete state to track when thinking is finished"
echo "  - Only display actualContent when thinkingComplete is true or there's no thinking"
echo "  - This ensures content doesn't appear while thinking is still streaming"
