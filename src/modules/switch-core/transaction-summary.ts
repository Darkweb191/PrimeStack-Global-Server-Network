type TransactionSummary = {
  id: string;
  stan: string;
  rrn: string | null;
  type: string;
  status: string;
  amount: { toString(): string };
  currency: string;
  cardType: string | null;
  approvalCode: string | null;
  responseCode: string | null;
  responseMessage: string | null;
  createdAt: Date;
  processedAt: Date | null;
  settledAt: Date | null;
  merchant: { code: string; legalName: string };
  terminal: { tid: string; serialNumber: string | null } | null;
};

function escapeHtml(value: string): string {
  const entities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  };
  return value.replace(/[&<>"']/g, (character) => entities[character] ?? character);
}

function row(label: string, value: string | null | undefined): string {
  return `<tr><th scope="row">${escapeHtml(label)}</th><td>${escapeHtml(value || "Not recorded")}</td></tr>`;
}

export function renderTransactionSummary(transaction: TransactionSummary): string {
  const amount = `${transaction.currency} ${transaction.amount.toString()}`;
  const recordedAt = transaction.createdAt.toISOString();

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>Transaction summary ${escapeHtml(transaction.stan)} | PrimeStack</title>
  <style>
    *{box-sizing:border-box}body{margin:0;padding:32px;background:#f1f4f8;color:#172033;font:15px/1.5 "Segoe UI",Arial,sans-serif}
    main{max-width:760px;margin:auto;padding:32px;background:white;border:1px solid #d8dee8;border-radius:10px}
    h1{margin:0;font-size:23px}header{display:flex;justify-content:space-between;gap:16px;align-items:center;border-bottom:1px solid #d8dee8;padding-bottom:20px}
    .brand{font-weight:700;color:#2442a8}.note{margin:22px 0;padding:12px 14px;background:#fff6db;border:1px solid #e8ca69;border-radius:6px;font-weight:600}
    .status{font-size:13px;font-weight:700;color:#2442a8}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{text-align:left;padding:11px 8px;border-bottom:1px solid #e6eaf0;overflow-wrap:anywhere}
    th{width:38%;color:#58657a;font-weight:500}footer{margin-top:22px;color:#58657a;font-size:12px}.actions{margin-top:22px}
    button{padding:9px 14px;border:1px solid #aeb9ca;border-radius:5px;background:white;font:inherit;cursor:pointer}
    @media print{body{padding:0;background:white}main{max-width:none;border:0;border-radius:0;padding:12px}.actions{display:none}}
    @media(max-width:520px){body{padding:12px}main{padding:18px}header{align-items:flex-start;flex-direction:column}th{width:42%}}
  </style>
</head>
<body>
  <main>
    <header><div><div class="brand">PrimeStack</div><h1>Transaction summary</h1></div><div class="status">${escapeHtml(transaction.status)}</div></header>
    <div class="note">Internal transaction record only. This is not a bank statement, SWIFT message, payment confirmation, or evidence of external settlement.</div>
    <table><tbody>
      ${row("Transaction reference (STAN)", transaction.stan)}
      ${row("PrimeStack transaction ID", transaction.id)}
      ${row("Retrieval reference (RRN)", transaction.rrn)}
      ${row("Transaction type", transaction.type)}
      ${row("Recorded amount", amount)}
      ${row("Merchant", `${transaction.merchant.legalName} (${transaction.merchant.code})`)}
      ${row("Terminal", transaction.terminal?.tid)}
      ${row("Payment method", transaction.cardType)}
      ${row("Approval code", transaction.approvalCode)}
      ${row("Response code", transaction.responseCode)}
      ${row("Response message", transaction.responseMessage)}
      ${row("Created at (UTC)", recordedAt)}
      ${row("Processed at (UTC)", transaction.processedAt?.toISOString())}
      ${row("Settled at (UTC)", transaction.settledAt?.toISOString())}
    </tbody></table>
    <footer>Values are shown as recorded by PrimeStack. A transaction status describes this system's record and does not independently verify interbank processing or beneficiary credit.</footer>
    <div class="actions"><button type="button" onclick="window.print()">Print / Save as PDF</button></div>
  </main>
</body>
</html>`;
}
