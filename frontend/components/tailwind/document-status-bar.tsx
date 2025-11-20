"use client";

import {
    Check,
    AlertCircle,
    Loader2,
    Download,
    FileSpreadsheet,
    Share2,
    Eye,
    EyeOff,
    FilePlus,
} from "lucide-react";
import { Button } from "./ui/button";

interface DocumentStatusBarProps {
    title: string;
    saveStatus: "unsaved" | "saving" | "saved";
    onSave?: () => void;
    isSaving?: boolean;
    onExportPDF?: () => void;
    onExportNewPDF?: () => void; // NEW: Professional PDF export
    onExportExcel?: () => void;
    onSharePortal?: () => void;
    // Removed vertical/service selects per request
    isGrandTotalVisible?: boolean; // 👁️ Toggle grand total visibility
    onToggleGrandTotal?: () => void; // 👁️ Toggle grand total visibility
}

export function DocumentStatusBar({
    title,
    saveStatus,
    onSave,
    isSaving = false,
    onExportPDF,
    onExportNewPDF,
    onExportExcel,
    onSharePortal,
    isGrandTotalVisible,
    onToggleGrandTotal,
}: DocumentStatusBarProps) {
    const statusConfig = {
        unsaved: {
            icon: AlertCircle,
            text: "Unsaved Changes",
            color: "text-yellow-400",
            bgColor: "bg-yellow-500/10",
        },
        saving: {
            icon: Loader2,
            text: "Saving...",
            color: "text-blue-400",
            bgColor: "bg-blue-500/10",
        },
        saved: {
            icon: Check,
            text: "All changes saved",
            color: "text-green-400",
            bgColor: "bg-green-500/10",
        },
    };

    const config = statusConfig[saveStatus];
    const IconComponent = config.icon;

    return (
        <div className="h-14 bg-[#0E0F0F] border-b border-[#2A2A2D] flex items-center justify-between px-3 sm:px-6 flex-shrink-0 overflow-hidden">
            {/* Title */}
            <div className="flex-1 min-w-0 mr-4">
                <h2 className="text-base sm:text-lg font-semibold text-white truncate">
                    {title}
                </h2>
            </div>

            {/* Actions Section - Responsive with overflow handling */}
            <div className="flex items-center gap-1 sm:gap-3 flex-shrink-0 overflow-x-auto scrollbar-hide">
                {/* Export Buttons - Responsive layout */}
                <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                    {onToggleGrandTotal && (
                        <Button
                            onClick={onToggleGrandTotal}
                            variant="outline"
                            size="sm"
                            className="bg-[#1A1A1D] hover:bg-[#2A2A2D] text-gray-300 hover:text-white border-[#2A2A2D] transition-colors whitespace-nowrap"
                            title={
                                isGrandTotalVisible
                                    ? "Hide combined total"
                                    : "Show combined total"
                            }
                        >
                            {isGrandTotalVisible ? (
                                <>
                                    <EyeOff className="w-4 h-4 sm:mr-2" />
                                    <span className="hidden sm:inline">Hide Total</span>
                                </>
                            ) : (
                                <>
                                    <Eye className="w-4 h-4 sm:mr-2" />
                                    <span className="hidden sm:inline">Show Total</span>
                                </>
                            )}
                        </Button>
                    )}

                    {onExportPDF && (
                        <Button
                            onClick={onExportPDF}
                            variant="outline"
                            size="sm"
                            className="bg-[#1A1A1D] hover:bg-[#2A2A2D] text-gray-300 hover:text-white border-[#2A2A2D] transition-colors whitespace-nowrap"
                            title="Export PDF"
                        >
                            <Download className="w-4 h-4 sm:mr-2" />
                            <span className="hidden sm:inline">Export PDF</span>
                        </Button>
                    )}

                    {onExportNewPDF && (
                        <Button
                            onClick={onExportNewPDF}
                            variant="outline"
                            size="sm"
                            className="bg-[#1A1A1D] hover:bg-green-600 text-green-400 hover:text-white border-green-600 transition-colors whitespace-nowrap"
                            title="Export Professional PDF"
                        >
                            <FilePlus className="w-4 h-4 sm:mr-2" />
                            <span className="hidden sm:inline">Export Professional PDF</span>
                        </Button>
                    )}

                    {/* Excel Export - NOW ENABLED */}
                    {onExportExcel && (
                        <Button
                            onClick={onExportExcel}
                            variant="outline"
                            size="sm"
                            className="bg-[#1A1A1D] hover:bg-[#2A2A2D] text-gray-300 hover:text-white border-[#2A2A2D] transition-colors whitespace-nowrap"
                            title="Export Excel"
                        >
                            <FileSpreadsheet className="w-4 h-4 sm:mr-2" />
                            <span className="hidden sm:inline">Export Excel</span>
                        </Button>
                    )}

                    {onSharePortal && (
                        <Button
                            onClick={onSharePortal}
                            variant="outline"
                            size="sm"
                            className="bg-[#1A1A1D] hover:bg-[#2A2A2D] text-gray-300 hover:text-white border-[#2A2A2D] transition-colors whitespace-nowrap"
                            title="Share Portal"
                        >
                            <Share2 className="w-4 h-4 sm:mr-2" />
                            <span className="hidden sm:inline">Share Portal</span>
                        </Button>
                    )}
                </div>

                {/* Separator - Hidden on mobile */}
                {(onExportPDF || onExportExcel || onSharePortal) &&
                    (onSave || saveStatus) && (
                        <div className="hidden sm:block h-6 w-px bg-[#2A2A2D] flex-shrink-0"></div>
                    )}

                {/* Status Indicator - Responsive */}
                <div
                    className={`flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 rounded ${config.bgColor} flex-shrink-0`}
                >
                    <IconComponent
                        className={`w-4 h-4 ${config.color} ${
                            saveStatus === "saving" ? "animate-spin" : ""
                        }`}
                    />
                    <span className={`text-xs sm:text-sm font-medium ${config.color} hidden sm:inline`}>
                        {config.text}
                    </span>
                </div>

                {/* Save Button - Responsive */}
                {onSave && (
                    <Button
                        onClick={onSave}
                        disabled={saveStatus === "saved" || isSaving}
                        className={`text-white font-semibold transition-all whitespace-nowrap flex-shrink-0 ${
                            saveStatus === "saved" || isSaving
                                ? "bg-gray-700 hover:bg-gray-700 text-gray-400 cursor-not-allowed"
                                : "bg-[#1CBF79] hover:bg-[#15a366]"
                        }`}
                        size="sm"
                    >
                        {isSaving ? (
                            <>
                                <Loader2 className="w-4 h-4 sm:mr-2 animate-spin" />
                                <span className="hidden sm:inline">Saving</span>
                            </>
                        ) : (
                            <span className="px-1 sm:px-0">Save</span>
                        )}
                    </Button>
                )}
            </div>
        </div>
    );
}
