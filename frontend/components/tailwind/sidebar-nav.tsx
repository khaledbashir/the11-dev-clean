"use client";

import React, { useState, useEffect } from "react";
import { Input } from "./ui/input";
import { ScrollArea } from "./ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { toast } from "sonner";
import { debug } from "@/lib/logger";
import type { Workspace, SOW } from "@/lib/types/sow";
import {
    ChevronDown,
    ChevronRight,
    FileText,
    Plus,
    Trash2,
    Edit3,
    LayoutDashboard,
    ChevronLeft,
    GripVertical,
    Settings,
} from "lucide-react";

interface Folder {
    id: string;
    name: string;
    workspace_slug?: string;
    slug?: string;
}

interface Document {
    id: string;
    title: string;
    folderId: string | null;
    vertical?: string | null;
    service_line?: string | null;
}

interface SidebarNavProps {
    workspaces?: Workspace[];
    documents: Document[];
    currentWorkspaceId?: string;
    currentSOWId?: string | null;

    onSelectWorkspace: (id: string) => void;
    onSelectSOW: (id: string) => void;
    onRenameSOW: (id: string, title: string) => void;
    onDeleteSOW: (id: string) => void;
    onRenameWorkspace: (id: string, name: string) => void;
    onReorderWorkspaces: (workspaces: Workspace[]) => void;
    onMoveSOW: (
        sowId: string,
        fromWorkspaceId: string,
        toWorkspaceId: string,
    ) => void;
    onReorderSOWs: (workspaceId: string, sows: SOW[]) => void;
    onViewChange: (view: "dashboard" | "editor") => void;
    currentView: "dashboard" | "editor";
    onCreateWorkspace: (
        name?: string,
        type?: "sow" | "client" | "generic",
    ) => void;
    onDeleteWorkspace: (id: string) => void;
    onCreateSOW: (workspaceId: string, sowName: string) => Promise<void>;

    folders?: Folder[];
    currentFolderId?: string | null;
    currentDocumentId?: string | null;
    onSelectFolder?: (id: string | null) => void;
    onSelectDocument?: (id: string) => void;
    onCreateFolder?: (name: string) => void;
    onCreateDocument?: (folderId: string | null, name: string) => void;
    onRenameFolder?: (id: string, name: string) => void;
    onDeleteFolder?: (id: string) => void;
    onRenameDocument?: (id: string, title: string) => void;
    onDeleteDocument?: (id: string) => void;
    onMoveDocument?: (
        documentId: string,
        fromFolderId: string | null,
        toFolderId: string | null,
    ) => void;
    onToggleSidebar?: () => void;
    sidebarOpen?: boolean;
}

export default function SidebarNav({
    workspaces,
    documents,
    currentWorkspaceId,
    currentSOWId,
    onSelectWorkspace,
    onSelectSOW,
    onRenameSOW,
    onDeleteSOW,
    onRenameWorkspace,
    onCreateWorkspace,
    onDeleteWorkspace,
    onCreateSOW,
    folders,
    currentFolderId,
    currentDocumentId,
    onSelectFolder,
    onSelectDocument,
    onCreateFolder,
    onCreateDocument,
    onRenameFolder,
    onDeleteFolder,
    onRenameDocument,
    onDeleteDocument,
    onMoveDocument,
    onToggleSidebar,
    sidebarOpen = true,
}: SidebarNavProps) {
    const actualFolders = Array.isArray(folders)
        ? folders
        : Array.isArray(workspaces)
          ? workspaces
          : [];
    const actualCurrentFolderId = currentFolderId || currentWorkspaceId || null;
    const actualCurrentDocumentId = currentDocumentId || currentSOWId || null;
    const actualDocuments = Array.isArray(documents) ? documents : [];
    const actualOnSelectFolder = onSelectFolder || onSelectWorkspace;
    const actualOnSelectDocument = onSelectDocument || onSelectSOW;
    const actualOnRenameDocument = onRenameDocument || onRenameSOW;
    const actualOnDeleteDocument = onDeleteDocument || onDeleteSOW;

    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
        new Set(actualFolders.map((f) => f.id)),
    );
    const [foldersExpanded, setFoldersExpanded] = useState(true);
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState("");
    const [showSettingsMenu, setShowSettingsMenu] = useState(false);
    const [confirmDialog, setConfirmDialog] = useState<{
        open: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
    } | null>(null);

    const isAgentFolder = (folder: any) => {
        const agentSlugs = [
            "gen-the-architect",
            "property-marketing-pro",
            "ad-copy-machine",
            "crm-communication-specialist",
            "case-study-crafter",
            "landing-page-persuader",
            "seo-content-strategist",
            "proposal-audit-specialist",
            "proposal-and-audit-specialist",
        ];
        const slug = folder.workspace_slug || folder.slug;
        const matchBySlug = slug && agentSlugs.includes(slug);
        const matchByName = agentSlugs.some((s) =>
            folder.name.toLowerCase().includes(s.replace(/-/g, " ")),
        );
        return matchBySlug || matchByName;
    };

    const isSystemFolder = (folder: any) => {
        const systemSlugs = [
            "default-client",
            "sow-master-dashboard",
            "gen",
            "sql",
            "sow-master-dashboard-63003769",
            "pop",
        ];
        const slug = folder.workspace_slug || folder.slug;
        const matchBySlug = slug && systemSlugs.includes(slug);
        const matchByName = systemSlugs.some((s) =>
            folder.name.toLowerCase().includes(s.replace(/-/g, " ")),
        );
        return matchBySlug || matchByName;
    };

    const isProtectedFolder = (folder: any) => {
        return isSystemFolder(folder) || isAgentFolder(folder);
    };

    const toggleFolder = (folderId: string) => {
        const newExpanded = new Set(expandedFolders);
        if (newExpanded.has(folderId)) {
            newExpanded.delete(folderId);
        } else {
            newExpanded.add(folderId);
        }
        setExpandedFolders(newExpanded);
    };

    const handleRename = (id: string, isWorkspace: boolean) => {
        if (renameValue.trim()) {
            if (isWorkspace) {
                onRenameWorkspace(id, renameValue);
            } else {
                onRenameSOW(id, renameValue);
            }
            setRenamingId(null);
            setRenameValue("");
        }
    };

    const sourceFolders =
        Array.isArray(workspaces) && workspaces.length > 0
            ? workspaces
            : actualFolders;
    const clientFolders = sourceFolders.filter(
        (f) => !isAgentFolder(f) && !isSystemFolder(f),
    );

    return (
        <div
            style={{
                width: "500px",
                minWidth: "500px",
                height: "100%",
                backgroundColor: "#0E0F0F",
                borderRight: "1px solid #374151",
                display: "flex",
                flexDirection: "column",
                position: "relative",
            }}
        >
            {/* Toggle Button */}
            {onToggleSidebar && (
                <button
                    onClick={onToggleSidebar}
                    style={{
                        position: "absolute",
                        top: "16px",
                        left: "16px",
                        padding: "10px",
                        backgroundColor: "rgba(17, 24, 39, 0.95)",
                        border: "1px solid #374151",
                        borderRadius: "8px",
                        color: "white",
                        cursor: "pointer",
                        zIndex: 50,
                    }}
                    title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
                >
                    {sidebarOpen ? (
                        <ChevronLeft size={20} />
                    ) : (
                        <ChevronRight size={20} />
                    )}
                </button>
            )}

            {/* Header */}
            <div
                style={{
                    padding: "24px 24px 16px 80px",
                    borderBottom: "1px solid #374151",
                }}
            >
                <h2
                    style={{
                        fontSize: "20px",
                        fontWeight: "bold",
                        color: "white",
                        margin: 0,
                    }}
                >
                    Social Garden
                </h2>
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflow: "hidden" }}>
                <ScrollArea style={{ height: "100%" }}>
                    <div style={{ padding: "8px" }}>
                        {/* Workspaces Header */}
                        <div
                            onClick={() => setFoldersExpanded(!foldersExpanded)}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                padding: "8px 16px",
                                cursor: "pointer",
                                borderRadius: "8px",
                                backgroundColor: foldersExpanded
                                    ? "rgba(55, 65, 81, 0.3)"
                                    : "transparent",
                                marginBottom: "8px",
                            }}
                        >
                            {foldersExpanded ? (
                                <ChevronDown size={16} color="#1CBF79" />
                            ) : (
                                <ChevronRight size={16} color="#1CBF79" />
                            )}
                            <LayoutDashboard
                                size={16}
                                color="#1CBF79"
                                style={{ marginLeft: "8px" }}
                            />
                            <span
                                style={{
                                    color: "#D1D5DB",
                                    marginLeft: "8px",
                                    fontSize: "14px",
                                    fontWeight: "500",
                                }}
                            >
                                Workspaces
                            </span>
                            <span
                                style={{
                                    color: "#6B7280",
                                    marginLeft: "auto",
                                    fontSize: "12px",
                                }}
                            >
                                ({clientFolders.length})
                            </span>
                            {foldersExpanded && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onCreateWorkspace?.();
                                    }}
                                    style={{
                                        marginLeft: "8px",
                                        padding: "6px",
                                        backgroundColor: "transparent",
                                        border: "none",
                                        borderRadius: "4px",
                                        color: "#9CA3AF",
                                        cursor: "pointer",
                                    }}
                                    title="Create new workspace"
                                >
                                    <Plus size={16} />
                                </button>
                            )}
                        </div>

                        {/* Workspaces List */}
                        {foldersExpanded && (
                            <div style={{ marginLeft: "24px" }}>
                                {clientFolders.map((folder) => {
                                    const isExpanded = expandedFolders.has(
                                        folder.id,
                                    );
                                    const folderDocuments =
                                        actualDocuments.filter(
                                            (d) => d.folderId === folder.id,
                                        );
                                    const isSelected =
                                        actualCurrentFolderId === folder.id;

                                    return (
                                        <div
                                            key={folder.id}
                                            style={{ marginBottom: "4px" }}
                                        >
                                            {/* Workspace Row */}
                                            <div
                                                style={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    padding: "8px 12px",
                                                    borderRadius: "6px",
                                                    backgroundColor: isSelected
                                                        ? "rgba(28, 191, 121, 0.1)"
                                                        : "transparent",
                                                    minHeight: "40px",
                                                }}
                                            >
                                                {/* Expand Button */}
                                                <button
                                                    onClick={() =>
                                                        toggleFolder(folder.id)
                                                    }
                                                    style={{
                                                        width: "24px",
                                                        height: "24px",
                                                        display: "flex",
                                                        alignItems: "center",
                                                        justifyContent:
                                                            "center",
                                                        backgroundColor:
                                                            "transparent",
                                                        border: "none",
                                                        borderRadius: "4px",
                                                        cursor: "pointer",
                                                        marginRight: "8px",
                                                    }}
                                                >
                                                    {isExpanded ? (
                                                        <ChevronDown
                                                            size={16}
                                                            color="#6B7280"
                                                        />
                                                    ) : (
                                                        <ChevronRight
                                                            size={16}
                                                            color="#6B7280"
                                                        />
                                                    )}
                                                </button>

                                                {/* Workspace Name */}
                                                <div
                                                    style={{
                                                        flex: 1,
                                                        marginRight: "12px",
                                                        minWidth: 0,
                                                        overflow: "visible",
                                                    }}
                                                >
                                                    {renamingId ===
                                                    folder.id ? (
                                                        <Input
                                                            value={renameValue}
                                                            onChange={(e) =>
                                                                setRenameValue(
                                                                    e.target
                                                                        .value,
                                                                )
                                                            }
                                                            onBlur={() =>
                                                                handleRename(
                                                                    folder.id,
                                                                    true,
                                                                )
                                                            }
                                                            onKeyDown={(e) => {
                                                                if (
                                                                    e.key ===
                                                                    "Enter"
                                                                )
                                                                    handleRename(
                                                                        folder.id,
                                                                        true,
                                                                    );
                                                            }}
                                                            style={{
                                                                height: "24px",
                                                                fontSize:
                                                                    "12px",
                                                                backgroundColor:
                                                                    "#374151",
                                                                border: "1px solid #4B5563",
                                                                color: "white",
                                                            }}
                                                            autoFocus
                                                            onClick={(e) =>
                                                                e.stopPropagation()
                                                            }
                                                        />
                                                    ) : (
                                                        <button
                                                            onClick={() =>
                                                                actualOnSelectFolder?.(
                                                                    folder.id,
                                                                )
                                                            }
                                                            style={{
                                                                width: "100%",
                                                                textAlign:
                                                                    "left",
                                                                padding:
                                                                    "4px 8px",
                                                                backgroundColor:
                                                                    "transparent",
                                                                border: "none",
                                                                borderRadius:
                                                                    "4px",
                                                                color: isSelected
                                                                    ? "#1CBF79"
                                                                    : "#D1D5DB",
                                                                fontSize:
                                                                    "14px",
                                                                cursor: "pointer",
                                                                display: "flex",
                                                                alignItems:
                                                                    "center",
                                                                overflow: "visible",
                                                                minWidth: 0,
                                                            }}
                                                            title={folder.name}
                                                        >
                                                            <span
                                                                style={{
                                                                    overflow: "visible",
                                                                    textOverflow: "clip",
                                                                    whiteSpace: "normal",
                                                                    wordBreak: "break-word",
                                                                    flex: 1,
                                                                    minWidth: 0,
                                                                }}
                                                            >
                                                                {folder.name}
                                                            </span>
                                                            <span
                                                                style={{
                                                                    marginLeft:
                                                                        "8px",
                                                                    fontSize:
                                                                        "12px",
                                                                    color: "#6B7280",
                                                                    flexShrink: 0,
                                                                }}
                                                            >
                                                                (
                                                                {
                                                                    folderDocuments.length
                                                                }
                                                                )
                                                            </span>
                                                        </button>
                                                    )}
                                                </div>

                                                {/* Action Buttons */}
                                                <div
                                                    style={{
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: "8px",
                                                        flexShrink: 0,
                                                    }}
                                                >
                                                    {/* Rename Button */}
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setRenamingId(
                                                                folder.id,
                                                            );
                                                            setRenameValue(
                                                                folder.name,
                                                            );
                                                        }}
                                                        style={{
                                                            width: "32px",
                                                            height: "32px",
                                                            display: "flex",
                                                            alignItems:
                                                                "center",
                                                            justifyContent:
                                                                "center",
                                                            backgroundColor:
                                                                "rgba(55, 65, 81, 0.5)",
                                                            border: "none",
                                                            borderRadius: "4px",
                                                            color: "#60A5FA",
                                                            cursor: "pointer",
                                                        }}
                                                        title="Rename"
                                                    >
                                                        <Edit3 size={16} />
                                                    </button>

                                                    {/* Delete Button */}
                                                    {!isProtectedFolder(
                                                        folder,
                                                    ) && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setConfirmDialog(
                                                                    {
                                                                        open: true,
                                                                        title: `Delete Folder?`,
                                                                        message: `Delete "${folder.name}" and move all documents to "All Docs"? This cannot be undone.`,
                                                                        onConfirm:
                                                                            () => {
                                                                                const folderDocs =
                                                                                    actualDocuments.filter(
                                                                                        (
                                                                                            d,
                                                                                        ) =>
                                                                                            d.folderId ===
                                                                                            folder.id,
                                                                                    );
                                                                                folderDocs.forEach(
                                                                                    (
                                                                                        doc,
                                                                                    ) => {
                                                                                        onMoveDocument?.(
                                                                                            doc.id,
                                                                                            folder.id,
                                                                                            null,
                                                                                        );
                                                                                    },
                                                                                );
                                                                                onDeleteFolder?.(
                                                                                    folder.id,
                                                                                );
                                                                                toast.success(
                                                                                    "Folder deleted, documents moved to All Docs",
                                                                                );
                                                                            },
                                                                    },
                                                                );
                                                            }}
                                                            style={{
                                                                width: "32px",
                                                                height: "32px",
                                                                display: "flex",
                                                                alignItems:
                                                                    "center",
                                                                justifyContent:
                                                                    "center",
                                                                backgroundColor:
                                                                    "rgba(55, 65, 81, 0.5)",
                                                                border: "none",
                                                                borderRadius:
                                                                    "4px",
                                                                color: "#F87171",
                                                                cursor: "pointer",
                                                            }}
                                                            title="Delete"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Documents in Folder */}
                                            {isExpanded && (
                                                <div
                                                    style={{
                                                        marginLeft: "32px",
                                                        marginTop: "4px",
                                                    }}
                                                >
                                                    {/* New Doc Button */}
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (onCreateSOW) {
                                                                const today =
                                                                    new Date();
                                                                const dateStr =
                                                                    today.toLocaleDateString(
                                                                        "en-US",
                                                                        {
                                                                            month: "short",
                                                                            day: "numeric",
                                                                        },
                                                                    );
                                                                const sowName = `${folder.name} - SOW ${dateStr}`;
                                                                onCreateSOW(
                                                                    folder.id,
                                                                    sowName,
                                                                );
                                                            }
                                                        }}
                                                        style={{
                                                            width: "100%",
                                                            display: "flex",
                                                            alignItems:
                                                                "center",
                                                            gap: "8px",
                                                            padding: "8px 12px",
                                                            backgroundColor:
                                                                "transparent",
                                                            border: "none",
                                                            borderRadius: "4px",
                                                            color: "#9CA3AF",
                                                            fontSize: "12px",
                                                            cursor: "pointer",
                                                            marginBottom: "4px",
                                                        }}
                                                        title="Create new SOW in this workspace"
                                                    >
                                                        <Plus size={14} />
                                                        <span>New Doc</span>
                                                    </button>

                                                    {/* Documents List */}
                                                    {folderDocuments.map(
                                                        (doc) => {
                                                            const isDocSelected =
                                                                actualCurrentDocumentId ===
                                                                doc.id;
                                                            return (
                                                                <div
                                                                    key={doc.id}
                                                                    style={{
                                                                        display:
                                                                            "flex",
                                                                        alignItems:
                                                                            "center",
                                                                        padding:
                                                                            "6px 12px",
                                                                        borderRadius:
                                                                            "4px",
                                                                        backgroundColor:
                                                                            isDocSelected
                                                                                ? "rgba(14, 46, 51, 1)"
                                                                                : "transparent",
                                                                        marginBottom:
                                                                            "2px",
                                                                        minHeight:
                                                                            "32px",
                                                                    }}
                                                                >
                                                                    <FileText
                                                                        size={
                                                                            14
                                                                        }
                                                                        style={{
                                                                            marginRight:
                                                                                "8px",
                                                                            color: "#9CA3AF",
                                                                        }}
                                                                    />

                                                                    <div
                                                                        style={{
                                                                            flex: 1,
                                                                            marginRight:
                                                                                "8px",
                                                                            minWidth: 0,
                                                                            overflow: "visible",
                                                                        }}
                                                                    >
                                                                        {renamingId ===
                                                                        doc.id ? (
                                                                            <Input
                                                                                value={
                                                                                    renameValue
                                                                                }
                                                                                onChange={(
                                                                                    e,
                                                                                ) =>
                                                                                    setRenameValue(
                                                                                        e
                                                                                            .target
                                                                                            .value,
                                                                                    )
                                                                                }
                                                                                onBlur={() =>
                                                                                    handleRename(
                                                                                        doc.id,
                                                                                        false,
                                                                                    )
                                                                                }
                                                                                onKeyDown={(
                                                                                    e,
                                                                                ) => {
                                                                                    if (
                                                                                        e.key ===
                                                                                        "Enter"
                                                                                    )
                                                                                        handleRename(
                                                                                            doc.id,
                                                                                            false,
                                                                                        );
                                                                                }}
                                                                                style={{
                                                                                    height: "20px",
                                                                                    fontSize:
                                                                                        "11px",
                                                                                    backgroundColor:
                                                                                        "#374151",
                                                                                    border: "1px solid #4B5563",
                                                                                    color: "white",
                                                                                }}
                                                                                autoFocus
                                                                                onClick={(
                                                                                    e,
                                                                                ) =>
                                                                                    e.stopPropagation()
                                                                                }
                                                                            />
                                                                        ) : (
                                                                            <button
                                                                                onClick={() =>
                                                                                    actualOnSelectDocument?.(
                                                                                        doc.id,
                                                                                    )
                                                                                }
                                                                                style={{
                                                                                    width: "100%",
                                                                                    textAlign:
                                                                                        "left",
                                                                                    padding:
                                                                                        "2px 4px",
                                                                                    backgroundColor:
                                                                                        "transparent",
                                                                                    border: "none",
                                                                                    borderRadius:
                                                                                        "2px",
                                                                                    color: isDocSelected
                                                                                        ? "white"
                                                                                        : "#9CA3AF",
                                                                                    fontSize:
                                                                                        "12px",
                                                                                    cursor: "pointer",
                                                                                    overflow: "visible",
                                                                                    minWidth: 0,
                                                                                }}
                                                                                title={
                                                                                    doc.title
                                                                                }
                                                                            >
                                                                                <span
                                                                                    style={{
                                                                                        overflow: "visible",
                                                                                        textOverflow: "clip",
                                                                                        whiteSpace: "normal",
                                                                                        wordBreak: "break-word",
                                                                                        display: "block",
                                                                                        width: "100%",
                                                                                    }}
                                                                                >
                                                                                    {doc.title}
                                                                                </span>
                                                                            </button>
                                                                        )}
                                                                    </div>

                                                                    {/* Document Action Buttons */}
                                                                    <div
                                                                        style={{
                                                                            display:
                                                                                "flex",
                                                                            alignItems:
                                                                                "center",
                                                                            gap: "4px",
                                                                            flexShrink: 0,
                                                                        }}
                                                                    >
                                                                        <button
                                                                            onClick={(
                                                                                e,
                                                                            ) => {
                                                                                e.stopPropagation();
                                                                                setRenamingId(
                                                                                    doc.id,
                                                                                );
                                                                                setRenameValue(
                                                                                    doc.title,
                                                                                );
                                                                            }}
                                                                            style={{
                                                                                width: "24px",
                                                                                height: "24px",
                                                                                display:
                                                                                    "flex",
                                                                                alignItems:
                                                                                    "center",
                                                                                justifyContent:
                                                                                    "center",
                                                                                backgroundColor:
                                                                                    "transparent",
                                                                                border: "none",
                                                                                borderRadius:
                                                                                    "2px",
                                                                                color: "#60A5FA",
                                                                                cursor: "pointer",
                                                                            }}
                                                                            title="Rename Document"
                                                                        >
                                                                            <Edit3
                                                                                size={
                                                                                    12
                                                                                }
                                                                            />
                                                                        </button>
                                                                        <button
                                                                            onClick={(
                                                                                e,
                                                                            ) => {
                                                                                e.stopPropagation();
                                                                                setConfirmDialog(
                                                                                    {
                                                                                        open: true,
                                                                                        title: `Delete Document?`,
                                                                                        message: `Delete "${doc.title}"? This cannot be undone.`,
                                                                                        onConfirm:
                                                                                            () => {
                                                                                                actualOnDeleteDocument?.(
                                                                                                    doc.id,
                                                                                                );
                                                                                                toast.success(
                                                                                                    "Document deleted",
                                                                                                );
                                                                                            },
                                                                                    },
                                                                                );
                                                                            }}
                                                                            style={{
                                                                                width: "24px",
                                                                                height: "24px",
                                                                                display:
                                                                                    "flex",
                                                                                alignItems:
                                                                                    "center",
                                                                                justifyContent:
                                                                                    "center",
                                                                                backgroundColor:
                                                                                    "transparent",
                                                                                border: "none",
                                                                                borderRadius:
                                                                                    "2px",
                                                                                color: "#F87171",
                                                                                cursor: "pointer",
                                                                            }}
                                                                            title="Delete Document"
                                                                        >
                                                                            <Trash2
                                                                                size={
                                                                                    12
                                                                                }
                                                                            />
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            );
                                                        },
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}

                                {clientFolders.length === 0 && (
                                    <div
                                        style={{
                                            padding: "16px",
                                            textAlign: "center",
                                        }}
                                    >
                                        <p
                                            style={{
                                                fontSize: "12px",
                                                color: "#6B7280",
                                                margin: 0,
                                            }}
                                        >
                                            No workspaces yet
                                        </p>
                                        <p
                                            style={{
                                                fontSize: "12px",
                                                color: "#4B5563",
                                                margin: "4px 0 0 0",
                                            }}
                                        >
                                            Create your first workspace to get
                                            started
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </div>

            {/* Settings Section */}
            <div
                style={{
                    borderTop: "1px solid #374151",
                    padding: "8px 16px",
                }}
            >
                <button
                    onClick={() => setShowSettingsMenu(!showSettingsMenu)}
                    style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "12px",
                        backgroundColor: "transparent",
                        border: "none",
                        borderRadius: "8px",
                        color: "#9CA3AF",
                        fontSize: "14px",
                        fontWeight: "500",
                        cursor: "pointer",
                    }}
                    title="Settings"
                >
                    <Settings size={16} />
                    <span style={{ flex: 1, textAlign: "left" }}>Settings</span>
                    {showSettingsMenu ? (
                        <ChevronDown size={12} />
                    ) : (
                        <ChevronRight size={12} />
                    )}
                </button>

                {showSettingsMenu && (
                    <div style={{ marginTop: "8px" }}>
                        <button
                            onClick={async () => {
                                if (
                                    !confirm(
                                        "⚠️ DANGER: This will delete ALL workspaces and SOWs!\n\nThis action cannot be undone. Are you absolutely sure?",
                                    )
                                ) {
                                    return;
                                }
                                if (
                                    !confirm(
                                        "🚨 FINAL WARNING: This will permanently delete:\n\n- All workspaces\n- All SOWs\n- All AnythingLLM workspaces\n\nType 'RESET' to confirm:",
                                    )
                                ) {
                                    return;
                                }
                                try {
                                    const response = await fetch(
                                        "/api/admin/reset-all",
                                        {
                                            method: "POST",
                                            headers: {
                                                "Content-Type":
                                                    "application/json",
                                            },
                                            body: JSON.stringify({
                                                confirm: "RESET_ALL_DATA",
                                            }),
                                        },
                                    );
                                    if (response.ok) {
                                        const result = await response.json();
                                        toast.success(
                                            `✅ Reset complete! Deleted ${result.results.folders_deleted} workspaces and ${result.results.sows_before} SOWs`,
                                        );
                                        setTimeout(
                                            () => window.location.reload(),
                                            1500,
                                        );
                                    } else {
                                        const error = await response.json();
                                        toast.error(
                                            `❌ Reset failed: ${error.error || "Unknown error"}`,
                                        );
                                    }
                                } catch (error) {
                                    toast.error(`❌ Reset failed: ${error}`);
                                }
                            }}
                            style={{
                                width: "100%",
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                padding: "8px 12px",
                                backgroundColor: "transparent",
                                border: "none",
                                borderRadius: "4px",
                                color: "#F87171",
                                fontSize: "12px",
                                cursor: "pointer",
                            }}
                            title="Reset all data - DANGEROUS!"
                        >
                            <Trash2 size={14} />
                            <span>Reset All Data</span>
                        </button>
                    </div>
                )}
            </div>

            {/* Confirmation Dialog */}
            <Dialog
                open={confirmDialog?.open || false}
                onOpenChange={(open) => {
                    if (!open) setConfirmDialog(null);
                }}
            >
                <DialogContent className="sm:max-w-sm bg-[#1A1A1D] border border-[#2A2A2D]">
                    <DialogHeader>
                        <DialogTitle className="text-white">
                            {confirmDialog?.title}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <p className="text-gray-300 text-sm">
                            {confirmDialog?.message}
                        </p>
                    </div>
                    <div className="flex gap-3 justify-end">
                        <button
                            onClick={() => setConfirmDialog(null)}
                            className="px-4 py-2 text-sm font-medium text-gray-300 bg-[#2A2A2D] hover:bg-[#3A3A3D] rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => {
                                confirmDialog?.onConfirm();
                                setConfirmDialog(null);
                            }}
                            className="px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
                        >
                            Delete
                        </button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
