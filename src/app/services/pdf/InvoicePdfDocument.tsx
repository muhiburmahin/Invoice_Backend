import { format } from "date-fns";
import React from "react";
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

import type { InvoicePrintData } from "./invoicePdf.types";

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#111827",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 10,
    color: "#6B7280",
  },
  section: {
    marginBottom: 16,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  label: {
    fontSize: 9,
    color: "#6B7280",
    marginBottom: 4,
    textTransform: "uppercase",
  },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    paddingBottom: 6,
    marginBottom: 6,
    fontWeight: "bold",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  colDesc: { width: "40%" },
  colQty: { width: "12%", textAlign: "right" },
  colRate: { width: "18%", textAlign: "right" },
  colAmount: { width: "18%", textAlign: "right" },
  colTax: { width: "12%", textAlign: "right" },
  totals: {
    marginTop: 12,
    alignSelf: "flex-end",
    width: "45%",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  totalLabel: { color: "#6B7280" },
  grandTotal: {
    fontSize: 12,
    fontWeight: "bold",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    marginTop: 4,
    paddingTop: 6,
  },
  notes: {
    marginTop: 20,
    padding: 10,
    backgroundColor: "#F9FAFB",
    borderRadius: 4,
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: "center",
    color: "#9CA3AF",
    fontSize: 8,
  },
});

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function formatAddress(parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(", ");
}

export function createInvoicePdfDocument(data: InvoicePrintData) {
  const accent = data.business.primaryColor ?? "#2563EB";
  const { business, client, invoice } = data;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={[styles.title, { color: accent }]}>{business.name}</Text>
            {business.email ? (
              <Text style={styles.subtitle}>{business.email}</Text>
            ) : null}
            {business.phone ? (
              <Text style={styles.subtitle}>{business.phone}</Text>
            ) : null}
            {business.website ? (
              <Text style={styles.subtitle}>{business.website}</Text>
            ) : null}
          </View>
          <View>
            <Text style={styles.label}>Invoice</Text>
            <Text style={{ fontSize: 14, fontWeight: "bold" }}>{invoice.number}</Text>
            <Text style={styles.subtitle}>
              Issue: {format(invoice.issueDate, "MMM d, yyyy")}
            </Text>
            <Text style={styles.subtitle}>
              Due: {format(invoice.dueDate, "MMM d, yyyy")}
            </Text>
            <Text style={styles.subtitle}>Status: {invoice.status}</Text>
          </View>
        </View>

        <View style={[styles.row, styles.section]}>
          <View style={{ width: "48%" }}>
            <Text style={styles.label}>From</Text>
            <Text>{business.name}</Text>
            <Text style={styles.subtitle}>
              {formatAddress([
                business.address,
                business.city,
                business.state,
                business.zipCode,
                business.country,
              ])}
            </Text>
            {business.taxNumber ? (
              <Text style={styles.subtitle}>Tax ID: {business.taxNumber}</Text>
            ) : null}
          </View>
          <View style={{ width: "48%" }}>
            <Text style={styles.label}>Bill To</Text>
            <Text>{client.name}</Text>
            {client.company ? (
              <Text style={styles.subtitle}>{client.company}</Text>
            ) : null}
            <Text style={styles.subtitle}>{client.email}</Text>
            <Text style={styles.subtitle}>
              {formatAddress([
                client.address,
                client.city,
                client.state,
                client.zipCode,
                client.country,
              ])}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.tableHeader}>
            <Text style={styles.colDesc}>Description</Text>
            <Text style={styles.colQty}>Qty</Text>
            <Text style={styles.colRate}>Rate</Text>
            <Text style={styles.colTax}>Tax</Text>
            <Text style={styles.colAmount}>Amount</Text>
          </View>
          {invoice.items.map((item, index) => (
            <View key={`${item.description}-${index}`} style={styles.tableRow}>
              <Text style={styles.colDesc}>{item.description}</Text>
              <Text style={styles.colQty}>
                {item.quantity}
                {item.unit ? ` ${item.unit}` : ""}
              </Text>
              <Text style={styles.colRate}>
                {formatMoney(item.rate, invoice.currency)}
              </Text>
              <Text style={styles.colTax}>{item.taxable ? "Yes" : "No"}</Text>
              <Text style={styles.colAmount}>
                {formatMoney(item.amount, invoice.currency)}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text>{formatMoney(invoice.subtotal, invoice.currency)}</Text>
          </View>
          {invoice.discount > 0 ? (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>
                Discount
                {invoice.discountType === "PERCENTAGE"
                  ? ` (${invoice.discount}%)`
                  : ""}
              </Text>
              <Text>
                -
                {formatMoney(
                  invoice.discountType === "PERCENTAGE"
                    ? invoice.subtotal * (invoice.discount / 100)
                    : invoice.discount,
                  invoice.currency,
                )}
              </Text>
            </View>
          ) : null}
          {invoice.taxAmount > 0 ? (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Tax ({invoice.taxRate}%)</Text>
              <Text>{formatMoney(invoice.taxAmount, invoice.currency)}</Text>
            </View>
          ) : null}
          <View style={[styles.totalRow, styles.grandTotal]}>
            <Text>Total</Text>
            <Text>{formatMoney(invoice.total, invoice.currency)}</Text>
          </View>
          {invoice.paidAmount > 0 ? (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Paid</Text>
              <Text>{formatMoney(invoice.paidAmount, invoice.currency)}</Text>
            </View>
          ) : null}
          {invoice.balanceDue > 0 ? (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Balance Due</Text>
              <Text>{formatMoney(invoice.balanceDue, invoice.currency)}</Text>
            </View>
          ) : null}
        </View>

        {invoice.notes ? (
          <View style={styles.notes}>
            <Text style={styles.label}>Notes</Text>
            <Text>{invoice.notes}</Text>
          </View>
        ) : null}

        {invoice.terms ? (
          <View style={[styles.notes, { marginTop: 10 }]}>
            <Text style={styles.label}>Terms</Text>
            <Text>{invoice.terms}</Text>
          </View>
        ) : null}

        {invoice.footer ? (
          <Text style={styles.footer}>{invoice.footer}</Text>
        ) : null}
      </Page>
    </Document>
  );
}
