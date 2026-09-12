import type { RowDataPacket } from "mysql2/promise";
import type { MySqlDatabase } from "../../../shared/infrastructure/mysql/MySqlConnection.js";
import { centsToDecimal, decimalToCents } from "../../../shared/domain/Money.js";
import { HttpError } from "../../../shared/http/HttpError.js";

export type PaymentLedgerPort = {
  appliedAmount(infractionId: number): Promise<string>;
};

export class NoPaymentsLedger implements PaymentLedgerPort {
  public appliedAmount(_infractionId: number): Promise<string> {
    void _infractionId;
    return Promise.resolve("0.00");
  }
}

export class MySqlPaymentsLedger implements PaymentLedgerPort {
  public constructor(private readonly database: MySqlDatabase) {}

  public async appliedAmount(infractionId: number): Promise<string> {
    const rows = await this.database.query<(RowDataPacket & { appliedAmount: string })[]>(
      `SELECT COALESCE(SUM(pa.amount),0) appliedAmount
       FROM payment_allocations pa
       JOIN payments p ON p.id=pa.payment_id AND p.status='CONFIRMED'
       LEFT JOIN payment_reversals pr ON pr.payment_id=p.id
       WHERE pa.infraction_id=? AND pr.id IS NULL`,
      [infractionId],
    );
    return rows[0]?.appliedAmount ?? "0.00";
  }
}

type BalanceRow = RowDataPacket & {
  originalAmount: string;
  debitAdjustments: string;
  creditAdjustments: string;
};

export type InfractionBalance = {
  originalAmount: string;
  debitAdjustments: string;
  creditAdjustments: string;
  approvedAdjustmentsNet: string;
  appliedPayments: string;
  pendingBalance: string;
};

export class BalanceService {
  public constructor(
    private readonly database: MySqlDatabase,
    private readonly payments: PaymentLedgerPort = new NoPaymentsLedger(),
  ) {}

  public async calculate(infractionId: number): Promise<InfractionBalance> {
    const rows = await this.database.query<BalanceRow[]>(
      `SELECT i.total_amount originalAmount,
              COALESCE(SUM(CASE WHEN a.status IN ('APPROVED','REVERSED') AND a.direction='DEBIT' THEN a.amount ELSE 0 END),0) debitAdjustments,
              COALESCE(SUM(CASE WHEN a.status IN ('APPROVED','REVERSED') AND a.direction='CREDIT' THEN a.amount ELSE 0 END),0) creditAdjustments
       FROM infractions i
       LEFT JOIN infraction_adjustments a ON a.infraction_id=i.id
       WHERE i.id=?
       GROUP BY i.id`,
      [infractionId],
    );
    const row = rows[0];
    if (!row) {
      throw new HttpError({ code: "INFRACTION_NOT_FOUND", message: "Infracción no encontrada.", statusCode: 404 });
    }
    const original = decimalToCents(row.originalAmount);
    const debits = decimalToCents(row.debitAdjustments);
    const credits = decimalToCents(row.creditAdjustments);
    const paid = decimalToCents(await this.payments.appliedAmount(infractionId));
    const adjustmentNet = debits - credits;
    const pending = original + adjustmentNet - paid;
    return {
      originalAmount: centsToDecimal(original),
      debitAdjustments: centsToDecimal(debits),
      creditAdjustments: centsToDecimal(credits),
      approvedAdjustmentsNet: centsToDecimal(adjustmentNet),
      appliedPayments: centsToDecimal(paid),
      pendingBalance: centsToDecimal(pending > 0n ? pending : 0n),
    };
  }
}
