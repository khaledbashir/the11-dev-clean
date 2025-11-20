"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { anythingLLM } from "@/lib/anythingllm";
import type { Agent, ChatMessage, Document } from "@/types";
import {
    extractFinancialReasoning,
    extractBudgetAndDiscount,
    extractClientName,
    extractPricingJSON,
    buildSuggestedRolesFromArchitectSOW,
} from "@/lib/page-utils";
import { WORKSPACE_CONFIG, getWorkspaceForAgent } from "@/lib/workspace-config";
import { ROLES } from "@/lib/rateCard";
import { sanitizeEmptyTextNodes } from "@/lib/page-utils";
import { extractSOWStructuredJson } from "@/lib/export-utils";
import { convertMarkdownToNovelJSON } from "@/lib/editor-utils";
import { ARCHITECT_SYSTEM_PROMPT } from "@/lib/system-prompt";

interface UseChatManagerProps {
    viewMode: "editor" | "dashboard";
    currentDoc?: Document | null;
    documents?: Document[];
    editorRef?: React.RefObject<any>;
    workspaces?: any[];
    currentWorkspaceId?: string;
    currentSOWId?: string;
    setLatestEditorJSON?: (content: any) => void;
}

export function useChatManager({
    viewMode,
    currentDoc = null,
    documents = [],
    editorRef = undefined,
    setLatestEditorJSON,
}: UseChatManagerProps) {
    const [agents, setAgents] = useState<Agent[]>([]);
    const [currentAgentId, setCurrentAgentId] = useState<string | null>(null);
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [isChatLoading, setIsChatLoading] = useState(false);
    const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
    const [lastUserPrompt, setLastUserPrompt] = useState<string>("");
    const [userPromptDiscount, setUserPromptDiscount] = useState<number>(0);
    const [multiScopePricingData, setMultiScopePricingData] = useState<any | null>(null);
    const [pendingFileText, setPendingFileText] = useState<string | null>(null);
    const [handshakeState, setHandshakeState] = useState<'idle' | 'analyzing' | 'waiting_confirmation' | 'generating'>('idle');

    const currentRequestControllerRef = useRef<AbortController | null>(null);
    const lastMessageSentTimeRef = useRef<number>(0);
    const MESSAGE_RATE_LIMIT = 1000;

    const log = useCallback((...args: any[]) => {
        if (process.env.NODE_ENV === "development") {
            console.log(...args);
        }
    }, []);

    const handleCreateAgent = useCallback(async (agent: Omit<Agent, "id">) => {
        const newId = `agent${Date.now()}`;
        const newAgent: Agent = { id: newId, ...agent };

        try {
            const response = await fetch("/api/agents", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newAgent),
            });

            if (response.ok) {
                setAgents((prev) => [...prev, newAgent]);
                setCurrentAgentId(newId);
                log("✅ Agent created in database");
            }
        } catch (error) {
            log("❌ Failed to create agent:", error);
        }
    }, [log]);

    const handleSelectAgent = useCallback(async (id: string) => {
        setCurrentAgentId(id);
        setChatMessages([]);
        log(`✅ Agent selected: ${id}. Chat history managed by AnythingLLM threads.`);
    }, [setChatMessages, log]);

    const handleUpdateAgent = useCallback(async (id: string, updates: Partial<Agent>) => {
        try {
            const response = await fetch(`/api/agents/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updates),
            });

            if (response.ok) {
                setAgents((prev) => prev.map((a) => (a.id === id ? { ...a, ...updates } : a)));
                log("✅ Agent updated in database");
            }
        } catch (error) {
            log("❌ Failed to update agent:", error);
        }
    }, [log]);

    const handleDeleteAgent = useCallback(async (id: string) => {
        try {
            const response = await fetch(`/api/agents/${id}`, {
                method: "DELETE",
            });

            if (response.ok) {
                setAgents((prev) => prev.filter((a) => a.id !== id));
                if (currentAgentId === id) {
                    setCurrentAgentId(null);
                    setChatMessages([]);
                }
                log("✅ Agent deleted from database (messages cascade deleted)");
            }
        } catch (error) {
            log("❌ Failed to delete agent:", error);
        }
    }, [currentAgentId, log]);

    const handleFileUpload = useCallback(async (file: File) => {
        if (!file) return;
        
        setIsChatLoading(true);
        
        // 1. Extract text (server-side)
        const formData = new FormData();
        formData.append('file', file);
        
        try {
            console.log(`📤 [Frontend] Uploading file: ${file.name} (${file.size} bytes)`);
            const res = await fetch('/api/extract-text', {
                method: 'POST',
                body: formData
            });
            
            if (!res.ok) {
                let errorMessage = 'Extraction failed';
                try {
                    const err = await res.json();
                    errorMessage = err.error || errorMessage;
                } catch (parseError) {
                    // If JSON parsing fails, use status text
                    errorMessage = `Server error: ${res.status} ${res.statusText}`;
                }
                
                console.error(`❌ [Frontend] Extraction failed: ${errorMessage}`);
                toast.error(`❌ PDF Extraction Failed: ${errorMessage}`);
                throw new Error(errorMessage);
            }
            
            const { text } = await res.json();
            
            if (!text || text.trim().length === 0) {
                const errorMsg = 'No text could be extracted from the PDF. The file may be image-only or corrupted.';
                console.error(`❌ [Frontend] ${errorMsg}`);
                toast.error(`❌ ${errorMsg}`);
                throw new Error(errorMsg);
            }
            
            const rawText = text;
            console.log(`✅ [Frontend] Text extracted successfully: ${rawText.length} characters`);
            setPendingFileText(rawText);
            
            // 2. Transient Injection (Handshake)
            // Construct messages for "Summary Plan"
            const messages = [
                { role: "system", content: ARCHITECT_SYSTEM_PROMPT },
                { role: "user", content: `Here is the Raw Client Brief. Read this fully before responding:\n\n${rawText}\n\nProvide a Summary Plan first. Do NOT generate the full SOW JSON yet. Tell me your plan for roles and estimated budget.` }
            ];
            
            // Add user message to UI
            const userMsg: ChatMessage = {
                id: `msg${Date.now()}`,
                role: "user",
                content: `Uploaded file: ${file.name}. Please analyze this brief.`,
                timestamp: Date.now()
            };
            setChatMessages(prev => [...prev, userMsg]);
            
            setHandshakeState('analyzing');
            
            const response = await anythingLLM.chatWithOpenAI(messages);
            
            if (response) {
                const aiMsg: ChatMessage = {
                    id: `msg${Date.now()}-ai`,
                    role: "assistant",
                    content: response,
                    timestamp: Date.now()
                };
                setChatMessages(prev => [...prev, aiMsg]);
                setHandshakeState('waiting_confirmation');
            } else {
                toast.error("AI failed to analyze the brief.");
                setHandshakeState('idle');
            }
            
        } catch (error: any) {
            console.error("❌ [Frontend] File upload error:", error);
            
            // Show specific error message if available
            const errorMessage = error.message || 'Failed to process file. Please check the file format and try again.';
            toast.error(`❌ ${errorMessage}`);
            
            setHandshakeState('idle');
        } finally {
            setIsChatLoading(false);
        }
    }, [log]);

    const handleInsertContent = useCallback(async (content: string, suggestedRoles: any[] = []) => {
        let localMultiScopeData: any = undefined;

        // Trim content to check if it's actually empty
        const trimmedContent = content?.trim() || "";
        
        log("📝 Inserting content into editor:", trimmedContent.substring(0, 100));
        log("📝 Content length:", trimmedContent.length);
        log("📝 Editor ref exists:", !!editorRef?.current);
        log("📄 Current doc ID:", currentDoc?.id || null);

        if (!editorRef?.current) {
            log("❌ Editor not initialized, cannot insert content.");
            toast.error("Editor not ready. Please wait a moment and try again.");
            return;
        }

        if (!trimmedContent) {
            log("❌ Content is empty after cleaning");
            toast.error("No content to insert. The AI response appears to be empty or contains only internal processing tags.");
            return;
        }

        if (!currentDoc?.id) {
            log("❌ Missing document ID");
            toast.error("No document is open. Please open a document first.");
            return;
        }

        extractFinancialReasoning(trimmedContent);

        try {
            let filteredContent = trimmedContent;
            // 🎯 FIX: Comprehensive thinking tag removal (all variants)
            filteredContent = filteredContent.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "");
            filteredContent = filteredContent.replace(/<think>[\s\S]*?<\/think>/gi, "");
            filteredContent = filteredContent.replace(/<AI_THINK>[\s\S]*?<\/AI_THINK>/gi, "");
            filteredContent = filteredContent.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "");
            
            // Clean up orphan closing tags
            if (filteredContent.includes("</think>") && !filteredContent.includes("<think>")) {
                filteredContent = filteredContent.replace(/^[\s\S]*?<\/think>/i, "").trim();
            }
            if (filteredContent.includes("</thinking>") && !filteredContent.includes("<thinking>")) {
                filteredContent = filteredContent.replace(/^[\s\S]*?<\/thinking>/i, "").trim();
            }
            
            // Final pass: Remove any remaining XML-style tags
            filteredContent = filteredContent.replace(/<\/?[A-Z_]+>/gi, "");

            // Complex content conversion logic with proper TipTap JSON structure
            let convertedContent: any;
            let finalContent: any;
            
            // Extract budget and discount information
            const { budget, discount } = extractBudgetAndDiscount(filteredContent);
            
            // Convert markdown to TipTap JSON structure
            const convertOptions: any = {
                preserveFormatting: true,
                extractPricing: true,
            };
            
            // Sanitize roles if provided
            const sanitized = suggestedRoles && suggestedRoles.length > 0
                ? sanitizeEmptyTextNodes(suggestedRoles)
                : [];
            
            try {
                convertedContent = convertMarkdownToNovelJSON(
                    filteredContent,
                    sanitized,
                    convertOptions,
                );
                finalContent = convertedContent;
            } catch (error) {
                console.error("Error converting content:", error);
                finalContent = { type: "doc", content: [] };
            }
            
            // CRITICAL DIAGNOSTIC: Check content type before insertion
            console.log("🧩 Final Content Type Check:");
            console.log("FinalContent is object:", typeof finalContent === 'object' && finalContent !== null);
            console.log("FinalContent type attribute:", finalContent?.type);
            if (typeof finalContent === 'string' || !finalContent || finalContent.type !== 'doc') {
                console.error("❌ CRITICAL INSERTION FAILURE: Final content is not a valid TipTap JSON object (type: 'doc'). Inserting raw string is blocked.");
                toast.error("Insertion failed: Content conversion error.");
                return; // Block insertion of invalid data
            }
            
            // Update editor with properly structured content
            if (editorRef.current) {
                if (editorRef.current.commands?.setContent) {
                    editorRef.current.commands.setContent(finalContent);
                } else {
                    editorRef.current.insertContent(finalContent);
                }
                // Sync with parent component state
                if (setLatestEditorJSON) {
                    setLatestEditorJSON(finalContent);
                }
                log("✅ Content inserted successfully with proper TipTap structure");
            }

            // Attempt to embed to AnythingLLM workspace if configured (non-blocking)
            // This runs asynchronously and won't block content insertion
            const workspaceForAgent = getWorkspaceForAgent(currentAgentId || "");
            if (workspaceForAgent && currentDoc?.id) {
                // Run embedding in background - don't await to avoid blocking insertion
                (async () => {
                    try {
                        // Get HTML content from editor if available, otherwise use filtered markdown
                        let htmlContent = filteredContent;
                        if (editorRef.current?.getHTML) {
                            htmlContent = editorRef.current.getHTML();
                        } else if (editorRef.current?.view?.dom) {
                            // Fallback: try to get HTML from editor DOM
                            htmlContent = editorRef.current.view.dom.innerHTML || filteredContent;
                        }
                        
                        // Fix parameter order: workspaceSlug, sowTitle, htmlContent, metadata
                        const success = await anythingLLM.embedSOWDocument(
                            workspaceForAgent,
                            currentDoc?.title || currentDoc?.id || "Untitled SOW",
                            htmlContent,
                            {
                                clientContext: currentDoc?.clientName || "",
                                source: "chat_insertion",
                            }
                        );
                        if (success) {
                            log("✅ Document embedded in AnythingLLM workspace");
                        } else {
                            log("⚠️ Embedding completed with warnings (non-critical)");
                        }
                    } catch (embedError) {
                        // Log but don't throw - embedding is optional
                        log("⚠️ Embedding error (non-critical):", embedError);
                        console.warn("⚠️ Failed to embed document to AnythingLLM (this is non-critical):", embedError);
                    }
                })();
            }

            toast.success("✅ Content inserted into editor!");
        } catch (error) {
            log("Error inserting content:", error);
            toast.error("❌ Failed to insert content. Please try again.");
        }
    }, [currentDoc, currentAgentId, editorRef, log]);

    const handleSendMessage = useCallback(async (message: string, threadSlugParam?: string | null, attachments?: Array<{ name: string; mime: string; contentString: string; }>) => {
        const isDashboardMode = viewMode === "dashboard";

        if (!message.trim()) return;

        // Handshake Confirmation Logic
        if (handshakeState === 'waiting_confirmation' && pendingFileText) {
             // User confirmed (presumably)
             setHandshakeState('generating');
             setIsChatLoading(true);
             
             // Construct full context chain
             const lastAiMessage = chatMessages[chatMessages.length - 1];
             
             const messages = [
                { role: "system", content: ARCHITECT_SYSTEM_PROMPT },
                { role: "user", content: `Here is the Raw Client Brief. Read this fully before responding:\n\n${pendingFileText}` },
                { role: "assistant", content: lastAiMessage?.content || "Plan acknowledged." },
                { role: "user", content: message + "\n\nGenerate the full SOW now." }
             ];
             
             // Add user message to UI
             const userMsg: ChatMessage = {
                id: `msg${Date.now()}`,
                role: "user",
                content: message,
                timestamp: Date.now()
             };
             setChatMessages(prev => [...prev, userMsg]);
             
             try {
                 const response = await anythingLLM.chatWithOpenAI(messages);
                 
                 if (response) {
                     const aiMsg: ChatMessage = {
                        id: `msg${Date.now()}-ai`,
                        role: "assistant",
                        content: response,
                        timestamp: Date.now()
                     };
                     setChatMessages(prev => [...prev, aiMsg]);
                     
                     // Trigger auto-insert if markers present
                     if (response.includes("*** Insert into editor:") || response.includes("```json")) {
                         // reuse existing logic
                         let contentToInsert = response;
                         if (response.includes("*** Insert into editor:")) {
                             contentToInsert = response.replace(/\*\*\* Insert into editor:\s*/, '');
                         }
                         // Process content through conversion logic and insert
                         extractFinancialReasoning(contentToInsert);
                         // For brevity, use handleInsertContent to insert content
                         await handleInsertContent(contentToInsert, []);
                     }
                     
                     setHandshakeState('idle'); // Reset
                     setPendingFileText(null); // Clear memory
                 }
             } catch (e) {
                 console.error(e);
                 toast.error("Generation failed.");
                 setHandshakeState('waiting_confirmation'); // Let them try again
             } finally {
                 setIsChatLoading(false);
                 currentRequestControllerRef.current = null;
             }
             
             return; // Exit function, don't do normal flow
        }

        const now = Date.now();
        if (now - lastMessageSentTimeRef.current < MESSAGE_RATE_LIMIT) {
            log(`⏱️ Rate limit: Please wait before sending another message.`);
            toast.error("⏱️ Please wait a moment before sending another message.");
            return;
        }
        lastMessageSentTimeRef.current = now;

        if (currentRequestControllerRef.current) {
            log("🛑 Cancelling previous request to avoid rate limiting...");
            currentRequestControllerRef.current.abort();
        }

        const controller = new AbortController();
        currentRequestControllerRef.current = controller;

        setIsChatLoading(true);

        // Insert command detection
        if (!isDashboardMode && (message.toLowerCase().includes("insert into editor") || message.toLowerCase() === "insert" || message.toLowerCase().includes("add to editor"))) {
            log("📝 Insert command detected!", { message });
            setIsChatLoading(false);

            const lastAIMessage = [...chatMessages].reverse().find((msg) => msg.role === "assistant" && !msg.content.includes("✅ SOW has been inserted") && !msg.content.includes("Ready to insert"));

            if (lastAIMessage) {
                extractFinancialReasoning(lastAIMessage.content);

                // For brevity, use handleInsertContent to insert lastAIMessage content
                await handleInsertContent(lastAIMessage.content, []);
            }

            return;
        }

        setLastUserPrompt(message);

        // 🎯 FIX: Optimistic UI - Add user message immediately before server response
        const userMessage: ChatMessage = {
            id: `msg${Date.now()}`,
            role: "user",
            content: message,
            timestamp: Date.now(),
        };

        // Immediately add user message to chat (optimistic UI)
        const newMessages = [...chatMessages, userMessage];
        setChatMessages(newMessages);

        try {
            // Stream response from AnythingLLM
            const workspace = currentDoc?.workspaceSlug || getWorkspaceForAgent(currentAgentId || "");
            const threadSlug = threadSlugParam || currentDoc?.threadSlug || `temp-${Date.now()}`;
            
            // Validate required parameters
            if (!workspace) {
                log("❌ [Chat] No workspace available");
                toast.error("No workspace configured. Please ensure a workspace is set up.");
                setIsChatLoading(false);
                currentRequestControllerRef.current = null;
                return;
            }
            
            if (!threadSlug || threadSlug.startsWith("temp-")) {
                log("⚠️ [Chat] Using temporary thread slug - thread may not be persisted");
            }
            
            log("📤 [Chat] Streaming message:", {
                workspace,
                threadSlug,
                messageLength: message.length,
            });
            
            // Create a placeholder assistant message
            const assistantMsgId = `msg${Date.now()}-assistant`;
            const assistantMessage: ChatMessage = {
                id: assistantMsgId,
                role: "assistant",
                content: "",
                timestamp: Date.now(),
            };
            setChatMessages((prev) => [...prev, assistantMessage]);
            setStreamingMessageId(assistantMsgId);

            // Variable to accumulate full response for final processing
            let fullResponseContent = "";
            
            // 🎯 FIX: Debounce stream rendering to prevent flickering
            let debounceTimeout: NodeJS.Timeout | null = null;
            let lastUpdateTime = 0;
            const DEBOUNCE_INTERVAL = 50; // Update UI every 50ms instead of every token

            await anythingLLM.streamChatWithThread(
                workspace,
                threadSlug,
                message,
                (chunk) => {
                    fullResponseContent += chunk;
                    
                    // Debounce UI updates to prevent flickering
                    const now = Date.now();
                    if (now - lastUpdateTime >= DEBOUNCE_INTERVAL) {
                        // Clear any pending timeout
                        if (debounceTimeout) {
                            clearTimeout(debounceTimeout);
                        }
                        
                        // Update immediately if enough time has passed
                        setChatMessages((prev) => 
                            prev.map((msg) => 
                                msg.id === assistantMsgId 
                                    ? { ...msg, content: fullResponseContent } 
                                    : msg
                            )
                        );
                        lastUpdateTime = now;
                    } else {
                        // Schedule update if not enough time has passed
                        if (debounceTimeout) {
                            clearTimeout(debounceTimeout);
                        }
                        debounceTimeout = setTimeout(() => {
                            setChatMessages((prev) => 
                                prev.map((msg) => 
                                    msg.id === assistantMsgId 
                                        ? { ...msg, content: fullResponseContent } 
                                        : msg
                                )
                            );
                            lastUpdateTime = Date.now();
                        }, DEBOUNCE_INTERVAL - (now - lastUpdateTime));
                    }
                },
                "chat"
            );
            
            // Final update to ensure we have the complete content
            if (debounceTimeout) {
                clearTimeout(debounceTimeout);
            }
            setChatMessages((prev) => 
                prev.map((msg) => 
                    msg.id === assistantMsgId 
                        ? { ...msg, content: fullResponseContent } 
                        : msg
                )
            );

            setStreamingMessageId(null);
            
            if (!fullResponseContent || !fullResponseContent.trim()) {
                log("⚠️ [Chat] Empty or whitespace-only response from AnythingLLM");
                // Don't show toast if it was just empty (maybe still thinking?) - but stream is done.
            }

            // Optionally auto-insert content from assistant message
            // We do this AFTER the stream completes to ensure we have the full JSON/content
            const hasMarker = fullResponseContent.includes("*** Insert into editor:");
            const hasJSON = fullResponseContent.includes("```json");
            const startsWithBrace = fullResponseContent.trim().startsWith("{");
            
            const isJsonBlock = hasJSON || startsWithBrace || hasMarker;
            
            if (!isDashboardMode && isJsonBlock) {
                let contentToInsert = fullResponseContent;
                
                if (hasMarker) {
                     // 🎯 FIX: Split content at marker and take the part AFTER it
                     // This ensures we discard any "thinking" logs or chat preamble before the marker
                     const parts = fullResponseContent.split("*** Insert into editor:");
                     if (parts.length > 1) {
                         contentToInsert = parts[parts.length - 1];
                     } else {
                         contentToInsert = fullResponseContent.replace(/\*\*\* Insert into editor:\s*/, '');
                     }
                }
                
                // Process content through conversion logic
                // Strip thinking tags before inserting into Editor
                let filteredContent = contentToInsert;
                
                // 🎯 FIX: Enhanced cleaning for thinking blocks (all variants)
                // Remove all thinking tag variants (order matters - most specific first)
                filteredContent = filteredContent.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "");
                filteredContent = filteredContent.replace(/<think>[\s\S]*?<\/think>/gi, "");
                filteredContent = filteredContent.replace(/<AI_THINK>[\s\S]*?<\/AI_THINK>/gi, "");
                filteredContent = filteredContent.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "");
                
                // Clean up orphan closing tags (assumes thinking is at start)
                // Handle cases where opening tag was missing or malformed
                if (filteredContent.includes("</think>") && !filteredContent.includes("<think>")) {
                    // Remove everything from start until the closing tag
                    filteredContent = filteredContent.replace(/^[\s\S]*?<\/think>/i, "").trim();
                }
                if (filteredContent.includes("</thinking>") && !filteredContent.includes("<thinking>")) {
                    filteredContent = filteredContent.replace(/^[\s\S]*?<\/thinking>/i, "").trim();
                }
                if (filteredContent.includes("</think>") && !filteredContent.includes("<think>")) {
                    filteredContent = filteredContent.replace(/^[\s\S]*?<\/redacted_reasoning>/i, "").trim();
                }
                
                // Final pass: Remove any remaining XML-style tags that might be internal
                filteredContent = filteredContent.replace(/<\/?[A-Z_]+>/gi, "");
                
                // Convert to TipTap JSON structure
                let convertedContent: any;
                let finalContent: any;
                
                const convertOptions: any = {
                    preserveFormatting: true,
                    extractPricing: true,
                };
                
                try {
                    convertedContent = convertMarkdownToNovelJSON(
                        filteredContent,
                        [],
                        convertOptions,
                    );
                    finalContent = convertedContent;
                } catch (error) {
                    console.error("Error converting content:", error);
                    finalContent = { type: "doc", content: [] };
                }
                
                // CRITICAL DIAGNOSTIC: Check content type before insertion
                console.log("🧩 [Automatic Insertion] Final Content Type Check:");
                console.log("FinalContent is object:", typeof finalContent === 'object' && finalContent !== null);
                console.log("FinalContent type attribute:", finalContent?.type);
                if (typeof finalContent === 'string' || !finalContent || finalContent.type !== 'doc') {
                    console.error("❌ CRITICAL INSERTION FAILURE: Final content is not a valid TipTap JSON object (type: 'doc'). Inserting raw string is blocked.");
                    toast.error("Insertion failed: Content conversion error.");
                    return; // Block insertion of invalid data
                }
                
                // [INJECT FIX HERE: Direct Editor Update]
                if (editorRef.current) {
                    if (editorRef.current.commands?.setContent) {
                        editorRef.current.commands.setContent(finalContent);
                    } else {
                        editorRef.current.insertContent(finalContent);
                    }
                    // Sync latestEditorJSON immediately after insertion
                    if (setLatestEditorJSON) {
                        setLatestEditorJSON(finalContent);
                    }
                    console.log("🔒 [Automatic Fix] Editor updated and state locked.");
                }
                // [END FIX]
                
                toast.success("✅ Content automatically inserted into SOW editor");
            }

            setIsChatLoading(false);
            currentRequestControllerRef.current = null;
        } catch (error) {
            log("Error sending message:", error);
            setIsChatLoading(false);
            setStreamingMessageId(null);
            currentRequestControllerRef.current = null;
        }
    }, [viewMode, currentDoc, currentAgentId, chatMessages, handleInsertContent, log]);

    // Effect: agent selection based on view context
    useEffect(() => {
        if (agents.length === 0) return;

        const determineAndSetAgent = async () => {
            let agentIdToUse: string | null = null;

            if (viewMode === "dashboard") {
                log("🎯 [Agent Selection] In DASHBOARD mode - agent managed by dashboard component");
                setCurrentAgentId(null);
            } else if (viewMode === "editor" && currentDoc?.id) {
                try {
                    const prefResponse = await fetch("/api/preferences/current_agent_id");
                    if (prefResponse.ok) {
                        const { value } = await prefResponse.json();
                        if (value && agents.find((a) => a.id === value)) {
                            agentIdToUse = value;
                            log(`🎯 [Agent Selection] Using saved agent preference: ${value}`);
                        }
                    }
                } catch (err) {
                    log("Failed to load agent preference:", err);
                }

                if (!agentIdToUse) {
                    const genArchitect = agents.find((a) => a.name === "GEN - The Architect" || a.id === "gen-the-architect");
                    agentIdToUse = genArchitect?.id || agents[0]?.id || null;
                    log(`🎯 [Agent Selection] In EDITOR mode - using default agent: ${agentIdToUse}`);
                }

                setCurrentAgentId(agentIdToUse);
            } else {
                log("🎯 [Agent Selection] No context yet - deferring agent selection");
                setCurrentAgentId(null);
            }
        };

        determineAndSetAgent();
    }, [agents, viewMode, currentDoc]);

    // Effect: persist current agent to preferences
    useEffect(() => {
        if (currentAgentId) {
            fetch("/api/preferences/current_agent_id", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ value: currentAgentId }),
            }).catch((err) => log("Failed to save agent preference:", err));
        }
    }, [currentAgentId]);

    // Effect: reactive chat context switching between Dashboard and Editor
    useEffect(() => {
        const switchContext = async () => {
            if (viewMode === "dashboard") {
                setChatMessages([]);
                setStreamingMessageId(null);
            } else if (viewMode === "editor") {
                const doc = currentDoc;
                if (doc?.threadSlug && !doc.threadSlug.startsWith("temp-") && doc.workspaceSlug) {
                    try {
                        log("💬 [Context Switch] Loading SOW chat history for thread:", doc.threadSlug);
                        const history = await anythingLLM.getThreadChats(doc.workspaceSlug, doc.threadSlug);
                        const messages: ChatMessage[] = (history || []).map((msg: any) => ({
                            id: `msg${Date.now()}-${Math.random()}`,
                            role: msg.role === "user" ? "user" : "assistant",
                            content: msg.content,
                            timestamp: Date.now(),
                        }));
                        // Guard: only set history if there are no local messages and no active streaming message
                        if (chatMessages.length === 0 && !streamingMessageId) {
                            setChatMessages(messages);
                        } else {
                            log("⚠️ [Context Switch] Skipping history load to avoid overwriting local messages.");
                        }
                    } catch (e) {
                        log("⚠️ Failed to load SOW chat history on context switch:", e);
                        setChatMessages([]);
                    }
                } else {
                    setChatMessages([]);
                }
            }
        };

        switchContext();
    }, [viewMode, currentDoc, documents]);

    return {
        agents,
        currentAgentId,
        setCurrentAgentId,
        chatMessages,
        isChatLoading,
        streamingMessageId,
        lastUserPrompt,
        userPromptDiscount,
        setUserPromptDiscount,
        multiScopePricingData,
        setMultiScopePricingData,
        setChatMessages,
        handleCreateAgent,
        handleSelectAgent,
        handleUpdateAgent,
        handleDeleteAgent,
        handleInsertContent,
        handleSendMessage,
        handleFileUpload,
        pendingFileText,
        handshakeState,
    };
}
