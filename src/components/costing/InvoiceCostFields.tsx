import type { CostFormulaConfig } from '../../types/models'
import {
  buildInvoiceValues,
  calculatePurchaseCost,
  formatRupees,
  invoiceQuantity,
  type InvoiceCostDraft,
} from '../../services/costingService'

interface InvoiceCostFieldsProps {
  draft: InvoiceCostDraft
  onChange: (draft: InvoiceCostDraft) => void
  brandName: string
  bottleSize: string
  mrp: number
  formula: CostFormulaConfig
  totalBottles?: number
}

const permitFields: Array<{ key: keyof InvoiceCostDraft; label: string; step?: string }> = [
  { key: 'numberOfCases', label: 'Case' },
  { key: 'looseBottles', label: 'Btls' },
  { key: 'bottleSizeMl', label: 'ML' },
  { key: 'mrpPerBottle', label: 'MRP (per bottle, ₹)', step: '0.01' },
  { key: 'invoiceTotalMrp', label: 'Total MRP (₹)', step: '0.01' },
  { key: 'adValorem', label: 'Ad Valorem (₹)', step: '0.01' },
  { key: 'vatAmount', label: 'VAT Amount (₹)', step: '0.01' },
  { key: 'tpfAmount', label: 'TPF Amount (₹)', step: '0.01' },
]

const additionalFields: Array<{ key: keyof InvoiceCostDraft; label: string; step?: string }> = [
  { key: 'bottlesPerCase', label: 'Bottles per case (stock calculation)' },
  { key: 'otherCharges', label: 'Other Charges (₹)', step: '0.01' },
  { key: 'discount', label: 'Discount (₹)', step: '0.01' },
  { key: 'actualInvoicePayable', label: 'Actual Invoice Payable (₹)', step: '0.01' },
]

export function InvoiceCostFields({ draft, onChange, brandName, bottleSize, mrp, formula, totalBottles }: InvoiceCostFieldsProps) {
  const quantity = totalBottles ?? invoiceQuantity(draft)
  const invoiceValues = buildInvoiceValues(draft, brandName, bottleSize, mrp, quantity)
  const calculation = calculatePurchaseCost(invoiceValues, formula)
  const mrpMismatch = draft.invoiceTotalMrp !== ''
    && Math.round(Number(draft.invoiceTotalMrp) * 100) !== calculation.calculatedTotalMrp
  const bulkLitres = quantity * invoiceValues.bottleSizeMl / 1000
  const renderFields = (fields: Array<{ key: keyof InvoiceCostDraft; label: string; step?: string }>) =>
    fields.map(({ key, label, step }) => (
      <label key={key}>{label}<input
        type="number"
        min="0"
        step={step}
        value={draft[key]}
        onChange={(event) => onChange({ ...draft, [key]: event.target.value })}
      /></label>
    ))

  return (
    <section className="invoice-cost-fields">
      <h3>Transport permit columns</h3>
      <div className="form-grid">{renderFields(permitFields)}</div>
      <h3 className="invoice-extra-heading">Additional invoice and stock details</h3>
      <div className="form-grid">{renderFields(additionalFields)}</div>
      <div className="cost-preview">
        <span>BL (calculated)<strong>{bulkLitres.toFixed(2)}</strong></span>
        <span>Total bottles<strong>{quantity}</strong></span>
        <span>Calculated total MRP<strong>{formatRupees(calculation.calculatedTotalMrp)}</strong></span>
        <span>Total purchase cost<strong>{calculation.status === 'verified' ? formatRupees(calculation.acquisitionCost) : 'Pending verification'}</strong></span>
        <span>Cost price / bottle<strong>{calculation.status === 'verified' ? formatRupees(calculation.costPerBottle) : 'Pending verification'}</strong></span>
        {calculation.status === 'verified' && <>
          <span>Profit/loss per bottle<strong className={calculation.lossWarning ? 'negative' : ''}>{formatRupees(calculation.profitLossPerBottle)}</strong></span>
          <span>Profit/loss %<strong className={calculation.lossWarning ? 'negative' : ''}>{calculation.profitPercentage === undefined ? '—' : `${calculation.profitPercentage.toFixed(2)}%`}</strong></span>
        </>}
      </div>
      {mrpMismatch && <p className="cost-warning" role="status">Invoice total MRP differs from bottles × MRP per bottle. Both values will be retained for audit.</p>}
      {calculation.lossWarning && <p className="cost-warning" role="alert">LOSS: verified cost price exceeds MRP.</p>}
      {calculation.status === 'pending' && <p className="settings-note">CP remains pending until actual invoice payable is entered or an administrator enables a verified formula.</p>}
      {formula.enabled && formula.verified && draft.actualInvoicePayable === '' && <p className="settings-note">CP uses the administrator-configured formula: {formula.verifiedReference}.</p>}
    </section>
  )
}
