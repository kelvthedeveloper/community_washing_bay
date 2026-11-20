import csv
import html
from io import BytesIO, StringIO

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


def build_csv(report):
    output = StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(["Community Washing Bay — Owner Report"])
    writer.writerow(["Currency", "GHS — Ghana cedi"])
    writer.writerow(["Start date", report["start_date"].isoformat()])
    writer.writerow(["End date", report["end_date"].isoformat()])
    writer.writerow(["Sales grouping", report["group_by"]])
    writer.writerow([])

    writer.writerow(["Opening summary"])
    writer.writerow(["Metric", "Amount"])
    for metric, amount in report["opening_summary"].items():
        writer.writerow([_csv_safe(_label(metric)), _money(amount)])
    writer.writerow([])

    writer.writerow(["Revenue breakdown"])
    writer.writerow(["Metric", "Amount"])
    for metric, amount in report["revenue_breakdown"].items():
        writer.writerow([_csv_safe(_label(metric)), _money(amount)])
    writer.writerow([])

    writer.writerow(["Sales by period"])
    writer.writerow(["Period start", "Sales", "Refunds", "Net revenue", "Jobs", "Vehicles"])
    for row in report["sales_by_period"]:
        writer.writerow(
            [
                row["period_start"].isoformat(),
                _money(row["sales"]),
                _money(row["refunds"]),
                _money(row["net_revenue"]),
                row["jobs"],
                row["vehicles"],
            ]
        )
    writer.writerow([])

    writer.writerow(["Sales by service"])
    writer.writerow(
        ["Service", "Quantity", "Sales before discounts", "Discounts", "Revenue"]
    )
    for row in report["sales_by_service"]:
        writer.writerow(
            [
                _csv_safe(row["service_name"]),
                row["quantity"],
                _money(row["sales_before_discounts"]),
                _money(row["discounts"]),
                _money(row["revenue"]),
            ]
        )
    writer.writerow([])

    writer.writerow(["Expenses by category"])
    writer.writerow(["Category", "Count", "Amount"])
    for row in report["expenses"]["by_category"]:
        writer.writerow(
            [
                _csv_safe(row["category_name"]),
                row["count"],
                _money(row["amount"]),
            ]
        )
    writer.writerow(["Total expenses", report["expenses"]["count"], _money(report["expenses"]["total"])])
    writer.writerow(
        [
            "Cancelled expenses excluded",
            report["expenses"]["cancelled_count"],
            _money(report["expenses"]["cancelled_amount"]),
        ]
    )
    writer.writerow([])

    writer.writerow(["Worker commissions"])
    writer.writerow(
        ["Worker", "Earned", "Adjustments", "Reversals", "Net commission", "Payouts"]
    )
    for row in report["commissions"]["by_worker"]:
        writer.writerow(
            [
                _csv_safe(row["worker_name"]),
                _money(row["earned"]),
                _money(row["adjustments"]),
                _money(row["reversals"]),
                _money(row["net_commission"]),
                _money(row["payouts"]),
            ]
        )
    writer.writerow(
        [
            "Commission totals",
            _money(report["commissions"]["earned"]),
            _money(report["commissions"]["adjustments"]),
            _money(report["commissions"]["reversals"]),
            _money(report["commissions"]["net_cost"]),
            _money(report["commissions"]["payouts"]),
        ]
    )
    writer.writerow([])

    writer.writerow(["Commission payouts by worker"])
    writer.writerow(["Worker", "Count", "Amount"])
    for row in report["commissions"]["payouts_by_worker"]:
        writer.writerow(
            [_csv_safe(row["worker_name"]), row["count"], _money(row["amount"])]
        )
    writer.writerow([])

    writer.writerow(["Inventory purchases by product"])
    writer.writerow(["Product", "Quantity", "Unit", "Purchase cost"])
    for row in report["inventory"]["purchases_by_product"]:
        writer.writerow(
            [
                _csv_safe(row["product_name"]),
                row["quantity"],
                _csv_safe(row["unit_label"]),
                _money(row["amount"]),
            ]
        )
    writer.writerow(
        ["Total inventory purchases", report["inventory"]["purchase_count"], _money(report["inventory"]["purchases"])]
    )
    writer.writerow([])

    writer.writerow(["Inventory usage by product"])
    writer.writerow(["Product", "Quantity", "Unit", "Usage cost"])
    for row in report["inventory"]["usage_by_product"]:
        writer.writerow(
            [
                _csv_safe(row["product_name"]),
                row["quantity"],
                _csv_safe(row["unit_label"]),
                _money(row["amount"]),
            ]
        )
    writer.writerow(
        ["Total inventory usage", "", "", _money(report["inventory"]["usage_cost"])]
    )
    writer.writerow([])

    writer.writerow(["Outstanding payments"])
    writer.writerow(
        ["Metric", "Amount", "Jobs"]
    )
    writer.writerow(
        [
            "Outstanding on active jobs",
            _money(report["outstanding_payments"]["amount"]),
            report["outstanding_payments"]["job_count"],
        ]
    )
    writer.writerow(
        [
            "Unrefunded cash held for cancelled jobs",
            _money(
                report["outstanding_payments"]["cash_held_for_cancelled_jobs"]
            ),
            "",
        ]
    )
    writer.writerow([])
    writer.writerow(["Profit estimates"])
    writer.writerow(["Gross profit estimate", _money(report["gross_profit_estimate"])])
    writer.writerow(["Net operating result", _money(report["net_operating_result"])])
    writer.writerow(
        [
            "Basis",
            "Net revenue less net commissions and inventory usage; less active "
            "recorded expenses. Inventory purchases are shown separately.",
        ]
    )
    return output.getvalue().encode("utf-8-sig")


def build_pdf(report):
    buffer = BytesIO()
    document = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=0.55 * inch,
        leftMargin=0.55 * inch,
        topMargin=0.55 * inch,
        bottomMargin=0.55 * inch,
        title="Community Washing Bay Owner Report",
        author="Community Washing Bay",
    )
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            "ReportHeading",
            parent=styles["Heading2"],
            textColor=colors.HexColor("#14532d"),
            spaceBefore=12,
            spaceAfter=6,
        )
    )
    styles.add(
        ParagraphStyle(
            "ReportCell",
            parent=styles["BodyText"],
            fontSize=8,
            leading=10,
            spaceAfter=0,
        )
    )
    styles.add(
        ParagraphStyle(
            "ReportCellRight",
            parent=styles["ReportCell"],
            alignment=TA_RIGHT,
        )
    )
    content = [
        Paragraph("Community Washing Bay — Owner Report", styles["Title"]),
        Paragraph(
            f"Period: {report['start_date'].isoformat()} to "
            f"{report['end_date'].isoformat()} · Sales grouped "
            f"{_escape(report['group_by'])} · Currency: GHS (Ghana cedi)",
            styles["BodyText"],
        ),
        Spacer(1, 0.18 * inch),
        _pdf_section(
            "Opening summary",
            ["Metric", "Amount"],
            [
                [_label(metric), _money(amount)]
                for metric, amount in report["opening_summary"].items()
            ],
            styles,
        ),
        _pdf_section(
            "Revenue breakdown",
            ["Metric", "Amount"],
            [
                [_label(metric), _money(amount)]
                for metric, amount in report["revenue_breakdown"].items()
            ],
            styles,
        ),
        _pdf_section(
            "Sales by period",
            ["Period", "Sales", "Refunds", "Net revenue", "Jobs", "Vehicles"],
            [
                [
                    row["period_start"].isoformat(),
                    _money(row["sales"]),
                    _money(row["refunds"]),
                    _money(row["net_revenue"]),
                    row["jobs"],
                    row["vehicles"],
                ]
                for row in report["sales_by_period"]
            ],
            styles,
        ),
        _pdf_section(
            "Sales by service",
            ["Service", "Qty", "Sales", "Discounts", "Revenue"],
            [
                [
                    row["service_name"],
                    row["quantity"],
                    _money(row["sales_before_discounts"]),
                    _money(row["discounts"]),
                    _money(row["revenue"]),
                ]
                for row in report["sales_by_service"]
            ],
            styles,
        ),
        _pdf_section(
            "Expenses by category",
            ["Category", "Count", "Amount"],
            [
                [row["category_name"], row["count"], _money(row["amount"])]
                for row in report["expenses"]["by_category"]
            ]
            + [
                [
                    "Total active expenses",
                    report["expenses"]["count"],
                    _money(report["expenses"]["total"]),
                ],
                [
                    "Cancelled expenses (excluded)",
                    report["expenses"]["cancelled_count"],
                    _money(report["expenses"]["cancelled_amount"]),
                ],
            ],
            styles,
        ),
        _pdf_section(
            "Worker commissions and payouts",
            ["Worker", "Earned", "Adjustments", "Reversals", "Net cost", "Payouts"],
            [
                [
                    row["worker_name"],
                    _money(row["earned"]),
                    _money(row["adjustments"]),
                    _money(row["reversals"]),
                    _money(row["net_commission"]),
                    _money(row["payouts"]),
                ]
                for row in report["commissions"]["by_worker"]
            ],
            styles,
        ),
        _pdf_section(
            "Commission payouts by worker",
            ["Worker", "Count", "Amount"],
            [
                [row["worker_name"], row["count"], _money(row["amount"])]
                for row in report["commissions"]["payouts_by_worker"]
            ],
            styles,
        ),
        _pdf_section(
            "Inventory purchases by product",
            ["Product", "Quantity", "Unit", "Purchase cost"],
            [
                [
                    row["product_name"],
                    row["quantity"],
                    row["unit_label"],
                    _money(row["amount"]),
                ]
                for row in report["inventory"]["purchases_by_product"]
            ],
            styles,
        ),
        _pdf_section(
            "Inventory usage by product",
            ["Product", "Quantity", "Unit", "Usage cost"],
            [
                [
                    row["product_name"],
                    row["quantity"],
                    row["unit_label"],
                    _money(row["amount"]),
                ]
                for row in report["inventory"]["usage_by_product"]
            ],
            styles,
        ),
        _pdf_section(
            "Outstanding payments",
            ["Metric", "Amount", "Jobs"],
            [
                [
                    "Outstanding on active jobs",
                    _money(report["outstanding_payments"]["amount"]),
                    report["outstanding_payments"]["job_count"],
                ],
                [
                    "Unrefunded cash held for cancelled jobs",
                    _money(
                        report["outstanding_payments"][
                            "cash_held_for_cancelled_jobs"
                        ]
                    ),
                    "",
                ],
            ],
            styles,
        ),
        Paragraph("Profit estimates", styles["ReportHeading"]),
        Paragraph(
            f"Gross profit estimate: {_money(report['gross_profit_estimate'])}",
            styles["BodyText"],
        ),
        Paragraph(
            f"Net operating result: {_money(report['net_operating_result'])}",
            styles["BodyText"],
        ),
        Spacer(1, 0.08 * inch),
        Paragraph(
            "Gross profit estimate = net revenue less net earned commissions and "
            "inventory usage cost. Net operating result subtracts active recorded "
            "expenses. Inventory purchases and commission payouts are reported as "
            "cash outflows and are not deducted a second time.",
            styles["Italic"],
        ),
    ]
    story = []
    for flowable in content:
        if isinstance(flowable, list):
            story.extend(flowable)
        else:
            story.append(flowable)
    document.build(story)
    return buffer.getvalue()


def _pdf_section(title, headers, rows, styles):
    data = [
        [Paragraph(_escape(header), styles["ReportCell"]) for header in headers]
    ]
    for row in rows:
        data.append(
            [
                Paragraph(_escape(value), styles["ReportCellRight" if index else "ReportCell"])
                for index, value in enumerate(row)
            ]
        )
    if len(data) == 1:
        data.append(
            [
                Paragraph("No records", styles["ReportCell"]),
                *[
                    Paragraph("", styles["ReportCell"])
                    for _ in headers[1:]
                ],
            ]
        )
    column_widths = {
        2: [5.0 * inch, 2.4 * inch],
        3: [3.4 * inch, 2.0 * inch, 2.0 * inch],
        4: [2.4 * inch, 1.65 * inch, 1.65 * inch, 1.65 * inch],
        5: [1.8 * inch, 1.4 * inch, 1.4 * inch, 1.4 * inch, 1.4 * inch],
        6: [1.55 * inch, 1.2 * inch, 1.2 * inch, 1.2 * inch, 1.2 * inch, 1.05 * inch],
    }.get(len(headers))
    table = Table(data, colWidths=column_widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eaf2eb")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#173b2b")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#dce5dc")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    return [Paragraph(_escape(title), styles["ReportHeading"]), table, Spacer(1, 0.1 * inch)]


def _money(amount):
    return f"GHS {amount:,.2f}"


def _label(value):
    return value.replace("_", " ").title()


def _escape(value):
    return html.escape(str(value), quote=True)


def _csv_safe(value):
    value = str(value)
    if value.startswith(("=", "+", "-", "@", "\t", "\r")):
        return f"'{value}"
    return value
