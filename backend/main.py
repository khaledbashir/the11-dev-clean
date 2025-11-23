from markupsafe import Markup
# For local dev, add "http://localhost:3000" to the list
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins
class ExcelRequest(BaseModel):
    sowData: dict
    filename: str


        print(f" Final Investment Target: {request.final_investment_target_text}")
        print(f"📊 HTML Content Length: {len(request.html_content)}")
        print("=== Has table tag:", "<table" in request.html_content.lower(), "===")

        # Defensive step: start with incoming HTML
        html_content = request.html_content

        # 🎯 When final_investment_target_text is provided, strip computed summary sections
        if request.final_investment_target_text:
            import re

        # Defensive redaction: remove any explicit timeline phrasing that uses weeks/months
        # This enforces the negative constraint at render-time in case the model or frontend included it.
        try:
            import re

            timeline_pattern = re.compile(
                r"\b(week|weeks|month|months|day|days)\b", flags=re.IGNORECASE
            )

            # Only redact within headings and list items to avoid false positives in prose
            def redact_timelines(html: str) -> str:
                # Remove lines that look like timeline bullets (e.g., 'Phase 1: 3-4 Weeks')
                redacted = re.sub(
                    r"<h[1-6][^>]*>[^<]*(?:timeline|timelines)[^<]*</h[1-6]>",
                    "<h4>TIMELINE REDACTED</h4>",
                    html,
                    flags=re.IGNORECASE,
                )
                redacted = re.sub(
                    r"<li[^>]*>[^<]*\\d+[^<]*(?:week|weeks|month|months|day|days)[^<]*</li>",
                    "<li><em>Timeline removed</em></li>",
                    redacted,
                    flags=re.IGNORECASE,
                )
                # Also redact inline durations like '3-4 weeks' or '4 weeks'
                redacted = timeline_pattern.sub(
                    lambda m: '<span class="redacted">[REDACTED]</span>', redacted
                )
                return redacted

            html_content = redact_timelines(html_content)
            print(
                "✅ Applied timeline redaction to HTML content to enforce negative constraints"
            )
        except Exception as _e:
            print("⚠️ Timeline redaction failed:", _e)

        # Load and encode the logo
        logo_base64 = ""
            html_content=safe_html,
class SOWItem(BaseModel):
    description: str
    role: str
    hours: float
    cost: float


class SOWScope(BaseModel):
    id: int
    title: str
    description: str
    items: list[SOWItem]
    deliverables: list[str]
    assumptions: list[str]


class ProfessionalPDFRequest(BaseModel):
    company: dict
    clientName: str
    projectTitle: str
    projectSubtitle: str
    projectOverview: str
    budgetNotes: str
    scopes: list[SOWScope]
    currency: str
    gstApplicable: bool
    generatedDate: str
    discount: Optional[float] = 0


@app.post("/generate-professional-pdf")
async def generate_professional_pdf(request: ProfessionalPDFRequest):
    try:
        print("=== DEBUG: Professional PDF Generation Request ===")

        # Load and encode the Social Garden logo
        logo_base64 = ""
        logo_path = Path(__file__).parent / "social-garden-logo-dark-new.png"
        if logo_path.exists():
            with open(logo_path, "rb") as logo_file:
                logo_base64 = base64.b64encode(logo_file.read()).decode("utf-8")

        # Load the template
        template_path = Path(__file__).parent / "multiscope_template.html"
        with open(template_path, "r") as f:
            template_str = f.read()

        template = Template(template_str)

        # Calculate financial totals in Python instead of Jinja2
        subtotal = 0.0
        scope_totals = []

        for scope in request.scopes:
            scope_total = sum(item.cost for item in scope.items)
            scope_totals.append(
                {
                    "title": scope.title,
                    "description": scope.description,
                    "deliverables": scope.deliverables
                    if hasattr(scope, "deliverables")
                    else [],
                    "assumptions": scope.assumptions
                    if hasattr(scope, "assumptions")
                    else [],
                    "total": scope_total,
                    "items": [
                        item.dict() if hasattr(item, "dict") else item
                        for item in scope.items
                    ],
                }
            )
            subtotal += scope_total

        discount_amount = 0.0
        if request.discount and request.discount > 0:
            discount_amount = subtotal * (request.discount / 100)

        total_after_discount = subtotal - discount_amount

        # Calculate GST on the post-discount amount (correct logic)
        gst_amount = 0.0
        if request.gstApplicable:
            gst_amount = total_after_discount * 0.10  # 10% GST

        final_total = total_after_discount + gst_amount

        # Render the HTML with calculated values
        full_html = template.render(
            css_content=DEFAULT_CSS,
            logo_base64=logo_base64,
            company=request.company,
            clientName=request.clientName,
            projectTitle=request.projectTitle,
            projectSubtitle=request.projectSubtitle,
            projectOverview=request.projectOverview,
            budgetNotes=request.budgetNotes,
            scopes=request.scopes,
            scope_totals=scope_totals,
            subtotal=subtotal,
            discount=request.discount,
            discount_amount=discount_amount,
            total_after_discount=total_after_discount,
            gst_amount=gst_amount,
            final_total=final_total,
            currency=lambda x: f"${x:,.2f}",
            generatedDate=request.generatedDate,
            gstApplicable=request.gstApplicable,
            currency_symbol=request.currency,
        )

        # Generate PDF
        html_doc = weasyprint.HTML(string=full_html)
        pdf_bytes = html_doc.write_pdf()

        output_dir = Path("/tmp/pdfs")
        output_dir.mkdir(exist_ok=True)
        pdf_path = output_dir / f"{request.projectTitle.replace(' ', '_')}.pdf"

        with open(pdf_path, "wb") as f:
            f.write(pdf_bytes)

        return FileResponse(
            pdf_path,
            media_type="application/pdf",
            filename=f"{request.projectTitle}.pdf",
        )

    except Exception as e:
        import traceback

        error_detail = (
            f"Professional PDF generation failed: {str(e)}\n{traceback.format_exc()}"
        )
        print(error_detail)
        raise HTTPException(status_code=500, detail=error_detail)


@app.post("/export-excel")
async def export_excel(request: ExcelRequest):
    """Export SOW data to Excel format"""
    try:
        import io

        import xlsxwriter

        # Create a workbook and add worksheets
        output = io.BytesIO()
        workbook = xlsxwriter.Workbook(output)

        # Extract data from request
        sow_data = request.sowData
        filename = request.filename

        # Get pricing data
        pricing_rows = sow_data.get("pricingRows", [])

        # Create summary sheet
        summary_ws = workbook.add_worksheet("SOW Summary")

        # Add headers
        summary_ws.write("A1", "Social Garden - Statement of Work")
        summary_ws.write("A2", sow_data.get("title", "Statement of Work"))
        summary_ws.write("A3", "")

        # Add pricing table if available
        if pricing_rows:
            summary_ws.write("A4", "Role")
            summary_ws.write("B4", "Hours")
            summary_ws.write("C4", "Rate (AUD)")
            summary_ws.write("D4", "Total (AUD)")

            row = 5
            subtotal = 0

            for item in pricing_rows:
                summary_ws.write(f"A{row}", item.get("role", ""))
                summary_ws.write(f"B{row}", item.get("hours", 0))
                summary_ws.write(f"C{row}", item.get("rate", 0))

                # Calculate total if not provided
                total = item.get("total", item.get("hours", 0) * item.get("rate", 0))
                summary_ws.write(f"D{row}", total)

                subtotal += total
                row += 1

            # Add totals
            summary_ws.write(f"A{row}", "Total Hours")
            summary_ws.write(f"B{row}", f"=SUM(B5:B{row - 1})")
            summary_ws.write(f"C{row}", "")
            summary_ws.write(f"D{row}", f"=SUM(D5:D{row - 1})")

            # Calculate discount and GST
            discount_percent = sow_data.get("discount", {}).get("value", 0)
            discount_type = sow_data.get("discount", {}).get("type", "percentage")

            if discount_type == "percentage":
                discount_amount = subtotal * (discount_percent / 100)
            else:
                discount_amount = discount_percent

            grand_total_pre_gst = subtotal - discount_amount
            gst_amount = grand_total_pre_gst * 0.1
            grand_total = grand_total_pre_gst + gst_amount

            # Add financial summary
            row += 2
            summary_ws.write(f"A{row}", "Subtotal (excl. GST)")
            summary_ws.write(f"D{row}", subtotal)

            if discount_amount > 0:
                row += 1
                summary_ws.write(f"A{row}", f"Discount ({discount_type})")
                summary_ws.write(f"D{row}", -discount_amount)

            row += 1
            summary_ws.write(f"A{row}", "Grand Total (excl. GST)")
            summary_ws.write(f"D{row}", grand_total_pre_gst)

            row += 1
            summary_ws.write(f"A{row}", "GST (10%)")
            summary_ws.write(f"D{row}", gst_amount)

            row += 1
            summary_ws.write(f"A{row}", "Total Inc. GST")
            summary_ws.write(f"D{row}", grand_total)

        # Set column widths
        summary_ws.set_column("A:D", 20)

        # Close workbook
        workbook.close()

        # Prepare output
        output.seek(0)

        # Return Excel file
        from fastapi.responses import StreamingResponse

        return StreamingResponse(
            io.BytesIO(output.read()),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        error_detail = f"Excel export failed: {str(e)}\n{traceback.format_exc()}"
        print(error_detail)
        raise HTTPException(status_code=500, detail=f"Excel export failed: {str(e)}")
