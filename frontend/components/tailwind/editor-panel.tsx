import React from "react";
import TailwindAdvancedEditor from "@/components/tailwind/advanced-editor";
import { DocumentStatusBar } from "@/components/tailwind/document-status-bar";
import HomeWelcome from "@/components/tailwind/home-welcome";

export default function EditorPanel({
    currentDoc,
    isGrandTotalVisible,
    toggleGrandTotal,
    editorRef,
    handleUpdateDoc,
    onExportPDF, // Accept onExportPDF from parent
    onExportNewPDF, // Accept onExportNewPDF from parent
    onExportExcel, // Accept onExportExcel from parent
    onSharePortal, // Accept onSharePortal from parent
    onCreateWorkspace,
    onOpenOnboarding,
    workspaceCount,
    isLoading,
}: any) {
    return (
        <div className="w-full h-full flex flex-col">
            {/* Header Bar - Always visible */}
            <DocumentStatusBar
                title={currentDoc ? (currentDoc.title || "Untitled Statement of Work") : "Social Garden SOW Generator"}
                saveStatus={currentDoc ? "saved" : "saved"}
                isSaving={false}
                isGrandTotalVisible={isGrandTotalVisible}
                onToggleGrandTotal={currentDoc ? toggleGrandTotal : undefined}
                onExportPDF={currentDoc ? onExportPDF : undefined}
                onExportNewPDF={currentDoc ? onExportNewPDF : undefined}
                onExportExcel={currentDoc ? onExportExcel : undefined}
                onSharePortal={currentDoc ? onSharePortal : undefined}
            />

            {/* Main Content Area */}
            <div className="flex-1 overflow-auto" data-show-totals={isGrandTotalVisible}>
                {currentDoc ? (
                    <div className="w-full h-full">
                        <TailwindAdvancedEditor
                            ref={editorRef}
                            initialContent={currentDoc.content}
                            onUpdate={handleUpdateDoc}
                        />
                    </div>
                ) : (
                    <HomeWelcome
                        onCreateWorkspace={() => {
                            // Open dialog - parent component should handle this
                            if (typeof onCreateWorkspace === 'function') {
                                // If it accepts no args, it's the dialog opener
                                onCreateWorkspace();
                            }
                        }}
                        onOpenOnboarding={() => onOpenOnboarding?.()}
                        workspaceCount={workspaceCount}
                        isLoading={isLoading}
                    />
                )}
            </div>
        </div>
    );
}
