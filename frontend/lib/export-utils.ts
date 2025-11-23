
    if (!content || !content.content) return rows;

    const findTables = (nodes: any[]): void => {
        nodes.forEach((node: any) => {
            if (node.type === "table" && node.content) {
                // Skip header row, process data rows
                const dataRows = node.content.slice(1);

                dataRows.forEach((row: any) => {
                    if (
                        row.type === "tableRow" &&
                        row.content &&
                        row.content.length >= 4
                    ) {
                        const cells = row.content;
                        const role =
                            cells[0]?.content?.[0]?.content?.[0]?.text || "";
                        const hours = parseFloat(
                            cells[1]?.content?.[0]?.content?.[0]?.text || "0",
                        );
                        const rateText =
                            cells[2]?.content?.[0]?.content?.[0]?.text || "";
                        const rate = parseFloat(rateText.replace(/[$,]/g, ""));
                        const totalText =
                            cells[3]?.content?.[0]?.content?.[0]?.text || "";
                        const total = parseFloat(
                            totalText.replace(/[$,+GST]/g, ""),
                        );

                        if (
                            role &&
                            !role.includes("Total") &&
                            !role.includes("Role")
                        ) {
                            rows.push({ role, hours, rate, total });
                        }
                    }
                });
            }

            if (node.content) {
                findTables(node.content);
            }
        });
    };

    findTables(content.content);

    // Return blob for API usage
    const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    return new Blob([excelBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
        // Return blob for API usage instead of direct download
        const pdfBlob = pdf.output("blob");
        return pdfBlob;
    } catch (error) {
        console.error("Error generating PDF:", error);
        return null;
export function parseSOWMarkdown(markdown: string): Partial<SOWData> {
    const lines = markdown.split("\n");
    const data: Partial<SOWData> = {
        pricingRows: [],
        deliverables: [],
        assumptions: [],
    };

    // Extract title (first H1)
    const titleMatch = markdown.match(/^#\s+(.+)$/m);
    if (titleMatch) {
        data.title = titleMatch[1];
    }

    // Extract client name
    const clientMatch = markdown.match(/\*\*Client:\*\*\s+(.+)$/m);
    if (clientMatch) {
        data.client = clientMatch[1];
    }

    // Extract overview
    const overviewMatch = markdown.match(/##\s+Overview\s+(.+?)(?=##|$)/s);
    if (overviewMatch) {
        data.overview = overviewMatch[1].trim();
    }

    // Extract deliverables
    const deliverablesMatch = markdown.match(
        /##\s+What does the scope include\?\s+(.+?)(?=##|$)/s,
    );
    if (deliverablesMatch) {
        const deliverableLines = deliverablesMatch[1].trim().split("\n");
        data.deliverables = deliverableLines
            .filter(
                (line) =>
                    line.trim().startsWith("•") ||
                    line.trim().startsWith("-") ||
                    line.trim().startsWith("+"),
            )
            .map((line) => line.replace(/^[•\-+]\s*/, "").trim());
    }

    // Extract discount info
    const discountMatch = markdown.match(
        /Discount\s+\((\d+)%\):\s*-?\$?([\d,]+\.?\d*)/i,
    );
    if (discountMatch) {
        data.discount = {
            type: "percentage",
            value: parseFloat(discountMatch[1]),
        };
    }

    return data;
    // Remove any internal comments, thinking tags, tool calls, etc.
    return (
        content
            // Remove <AI_THINK> tags
            .replace(/<AI_THINK>[\s\S]*?<\/AI_THINK>/gi, "")
            // Remove <think> tags
            .replace(/<think>[\s\S]*?<\/think>/gi, "")
            // Remove <tool_call> tags
            .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "")
            // Remove HTML comments
            .replace(/<!-- .*? -->/gi, "")
            // Remove any remaining XML-style tags that might be internal
            .replace(/<\/?[A-Z_]+>/gi, "")
            .trim()
    );
