import { naira, type Order } from "./commerce";

export type OrderEmailContent = { subject: string; text: string; html: string };

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

function emailFrame(title: string, content: string, trackingUrl: string, contactUrl: string) {
  return `<!doctype html>
<html lang="en-NG"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;background:#f7f5ed;color:#183f31;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6">
<table role="presentation" style="width:100%;border-collapse:collapse"><tr><td style="padding:24px 12px">
<table role="presentation" style="width:100%;max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e1e5dc;border-collapse:collapse">
<tr><td style="padding:28px 24px;background:#174b38;color:#ffffff;border-bottom:4px solid #c5a65c"><p style="margin:0;font-size:24px;font-weight:bold;letter-spacing:1px">IMPERIAL</p><p style="margin:2px 0 0;font-size:14px">Foods &amp; Beverages</p></td></tr>
<tr><td style="padding:28px 24px"><h1 style="margin:0 0 16px;font-size:26px;line-height:1.25">${escapeHtml(title)}</h1>
${content}
<p style="margin:28px 0"><a href="${escapeHtml(trackingUrl)}" style="display:inline-block;padding:12px 22px;background:#174b38;color:#ffffff;text-decoration:none;font-weight:bold;border-radius:6px">Track your order</a></p>
<p style="font-size:14px">For your privacy, the tracking page also asks for the phone number used for the order.</p>
<p style="margin-bottom:0">Need help? <a href="${escapeHtml(contactUrl)}" style="color:#174b38">Contact Imperial</a> and quote your order reference.</p></td></tr>
</table></td></tr></table></body></html>`;
}

function orderLinks(id: string, origin: string) {
  const tracking = new URL("/track", origin);
  tracking.searchParams.set("ref", id);
  return { tracking: tracking.href, contact: new URL("/contact", origin).href };
}

export function orderReceiptContent(order: Order, origin: string): OrderEmailContent {
  const links = orderLinks(order.id, origin);
  const subject = `Your Imperial order confirmation · ${order.id}`;
  const payment = order.payment?.status === "paid" ? "Payment confirmed." : "Check your order status on the tracking page.";
  const text = [
    "Imperial Foods & Beverages", "Order received", `Hello ${order.customer.name},`,
    `Order reference: ${order.id}`, "", "Your items",
    ...order.items.map((item) => `${item.quantity} × ${item.name}${item.size ? ` (${item.size})` : ""} — ${naira(item.quantity * item.price)}`),
    "", `Subtotal: ${naira(order.subtotal)}`, `Delivery: ${naira(order.shipping)}`, `Total: ${naira(order.total)}`,
    payment, "", `Track your order: ${links.tracking}`,
    "Use the phone number entered at checkout to view your order securely.", `Need help? ${links.contact}`,
  ].join("\n");
  const rows = order.items.map((item) => `<tr>
<td style="padding:16px 8px 16px 0;border-bottom:1px solid #e1e5dc;overflow-wrap:anywhere"><strong>${escapeHtml(item.name)}</strong>${item.size ? `<br><span style="font-size:14px;color:#55695e">${escapeHtml(item.size)}</span>` : ""}<br><span style="font-size:14px">Quantity: ${item.quantity}<br>Unit price: ${escapeHtml(naira(item.price))}</span></td>
<td style="padding:16px 0;border-bottom:1px solid #e1e5dc;text-align:right;vertical-align:top;white-space:nowrap">${escapeHtml(naira(item.quantity * item.price))}</td></tr>`).join("");
  const content = `<p>Hello ${escapeHtml(order.customer.name)},</p><p>Thank you for shopping with Imperial. Here are the details of your order.</p>
<p style="padding:12px;background:#f7f5ed;overflow-wrap:anywhere"><strong>Order reference</strong><br>${escapeHtml(order.id)}</p>
<h2 style="font-size:19px;margin-top:24px">Your items</h2>
<table aria-label="Order items and totals" style="width:100%;border-collapse:collapse;font-size:15px"><thead><tr><th scope="col" style="text-align:left">Item &amp; selling unit</th><th scope="col" style="text-align:right">Amount</th></tr></thead><tbody>${rows}
<tr><td style="padding-top:16px">Subtotal</td><td style="padding-top:16px;text-align:right;white-space:nowrap">${escapeHtml(naira(order.subtotal))}</td></tr>
<tr><td>Delivery</td><td style="text-align:right;white-space:nowrap">${escapeHtml(naira(order.shipping))}</td></tr>
<tr><td style="padding-top:10px;font-size:18px"><strong>Total</strong></td><td style="padding-top:10px;text-align:right;font-size:18px;white-space:nowrap"><strong>${escapeHtml(naira(order.total))}</strong></td></tr></tbody></table>
<p>${payment}</p>`;
  return { subject, text, html: emailFrame("Order received", content, links.tracking, links.contact) };
}

export function fulfilmentEmailContent(id: string, stage: string, origin: string): OrderEmailContent {
  const links = orderLinks(id, origin);
  const subject = `Imperial order update: ${stage}`;
  const text = ["Imperial Foods & Beverages", `Order reference: ${id}`, `Order update: ${stage}`,
    `Track your order: ${links.tracking}`, `Need help? ${links.contact}`].join("\n");
  const content = `<p><strong>Order reference:</strong> ${escapeHtml(id)}</p><p>The latest recorded status of your order is <strong>${escapeHtml(stage)}</strong>.</p>`;
  return { subject, text, html: emailFrame(stage, content, links.tracking, links.contact) };
}
