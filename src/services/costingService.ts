import type {
  CostFormulaComponent,
  CostFormulaConfig,
  Product,
  PurchaseInvoiceValues,
} from '../types/models'

export interface InvoiceCostDraft {
  numberOfCases: string
  bottlesPerCase: string
  looseBottles: string
  bottleSizeMl: string
  mrpPerBottle: string
  invoiceTotalMrp: string
  adValorem: string
  vatAmount: string
  tpfAmount: string
  otherCharges: string
  discount: string
  actualInvoicePayable: string
}

export interface CostCalculation {
  status: 'verified' | 'pending'
  source: 'actual-invoice-payable' | 'configured-formula' | 'pending'
  totalBottles: number
  calculatedTotalMrp: number
  acquisitionCost?: number
  costPerBottle?: number
  profitLossPerBottle?: number
  totalProfitLoss?: number
  profitPercentage?: number
  lossWarning: boolean
}

export const EMPTY_INVOICE_COST_DRAFT: InvoiceCostDraft = {
  numberOfCases: '',
  bottlesPerCase: '',
  looseBottles: '',
  bottleSizeMl: '',
  mrpPerBottle: '',
  invoiceTotalMrp: '',
  adValorem: '',
  vatAmount: '',
  tpfAmount: '',
  otherCharges: '',
  discount: '',
  actualInvoicePayable: '',
}

export const EMPTY_COST_FORMULA: CostFormulaConfig = {
  enabled: false,
  verified: false,
  verifiedReference: '',
  components: {},
}

const numeric = (value: string) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

const rupeesToPaise = (value: string) => Math.round(numeric(value) * 100)

export function invoiceQuantity(draft: InvoiceCostDraft) {
  return Math.floor(numeric(draft.numberOfCases)) * Math.floor(numeric(draft.bottlesPerCase))
    + Math.floor(numeric(draft.looseBottles))
}

export function hasInvoiceQuantity(draft: InvoiceCostDraft) {
  return [draft.numberOfCases, draft.bottlesPerCase, draft.looseBottles].some((value) => value !== '')
}

export function isValidInvoiceDraft(draft: InvoiceCostDraft) {
  const amounts = Object.values(draft)
  if (amounts.some((value) => value !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0))) return false
  const integerFields = [draft.numberOfCases, draft.bottlesPerCase, draft.looseBottles, draft.bottleSizeMl]
  if (integerFields.some((value) => value !== '' && !Number.isInteger(Number(value)))) return false
  return Number(draft.numberOfCases || 0) <= 0 || Number(draft.bottlesPerCase || 0) > 0
}

export function buildInvoiceValues(
  draft: InvoiceCostDraft,
  brandName: string,
  bottleSize: string,
  fallbackMrp: number,
  totalBottles: number,
): PurchaseInvoiceValues {
  const mrpPerBottle = draft.mrpPerBottle === '' ? fallbackMrp : rupeesToPaise(draft.mrpPerBottle)
  const calculatedTotalMrp = Math.max(0, totalBottles) * mrpPerBottle
  const invoiceTotalMrp = draft.invoiceTotalMrp === '' ? undefined : rupeesToPaise(draft.invoiceTotalMrp)
  const bottleSizeMl = draft.bottleSizeMl === ''
    ? Number.parseInt(bottleSize, 10) || 0
    : Math.floor(numeric(draft.bottleSizeMl))
  const actualInvoicePayable = draft.actualInvoicePayable === ''
    ? undefined
    : rupeesToPaise(draft.actualInvoicePayable)

  return {
    originalInputs: { ...draft },
    brandName,
    bottleSizeMl,
    numberOfCases: Math.floor(numeric(draft.numberOfCases)),
    bottlesPerCase: Math.floor(numeric(draft.bottlesPerCase)),
    looseBottles: Math.floor(numeric(draft.looseBottles)),
    totalBottles,
    mrpPerBottle,
    invoiceTotalMrp,
    calculatedTotalMrp,
    adValorem: rupeesToPaise(draft.adValorem),
    vatAmount: rupeesToPaise(draft.vatAmount),
    tpfAmount: rupeesToPaise(draft.tpfAmount),
    otherCharges: rupeesToPaise(draft.otherCharges),
    discount: rupeesToPaise(draft.discount),
    actualInvoicePayable,
  }
}

const componentValues: Record<CostFormulaComponent, (values: PurchaseInvoiceValues) => number> = {
  totalMrp: (values) => values.calculatedTotalMrp,
  adValorem: (values) => values.adValorem,
  vatAmount: (values) => values.vatAmount,
  tpfAmount: (values) => values.tpfAmount,
  otherCharges: (values) => values.otherCharges,
  discount: (values) => values.discount,
}

export function calculatePurchaseCost(values: PurchaseInvoiceValues, formula: CostFormulaConfig): CostCalculation {
  const totalBottles = values.totalBottles
  const calculatedTotalMrp = totalBottles * values.mrpPerBottle
  let acquisitionCost: number | undefined
  let source: CostCalculation['source'] = 'pending'

  if (values.actualInvoicePayable !== undefined) {
    acquisitionCost = values.actualInvoicePayable
    source = 'actual-invoice-payable'
  } else if (formula.enabled && formula.verified && Object.keys(formula.components).length > 0) {
    acquisitionCost = Object.entries(formula.components).reduce((total, [key, direction]) => {
      const component = componentValues[key as CostFormulaComponent]
      return total + (direction === 'subtract' ? -component(values) : component(values))
    }, 0)
    if (acquisitionCost <= 0) acquisitionCost = undefined
    else source = 'configured-formula'
  }

  if (totalBottles <= 0 || acquisitionCost === undefined) {
    return { status: 'pending', source: 'pending', totalBottles, calculatedTotalMrp, lossWarning: false }
  }

  const costPerBottle = Math.round(acquisitionCost / totalBottles)
  const profitLossPerBottle = values.mrpPerBottle - costPerBottle
  return {
    status: 'verified',
    source,
    totalBottles,
    calculatedTotalMrp,
    acquisitionCost,
    costPerBottle,
    profitLossPerBottle,
    totalProfitLoss: profitLossPerBottle * totalBottles,
    profitPercentage: costPerBottle > 0 ? profitLossPerBottle / costPerBottle * 100 : undefined,
    lossWarning: costPerBottle > values.mrpPerBottle,
  }
}

export function productCostMetrics(product: Product) {
  if (product.purchasePriceStatus !== 'verified') {
    return { verified: false as const, costPerBottle: undefined, profitLossPerBottle: undefined, profitPercentage: undefined, lossWarning: false }
  }
  const profitLossPerBottle = product.mrp - product.purchasePrice
  return {
    verified: true as const,
    costPerBottle: product.purchasePrice,
    profitLossPerBottle,
    profitPercentage: product.purchasePrice > 0 ? profitLossPerBottle / product.purchasePrice * 100 : undefined,
    lossWarning: product.purchasePrice > product.mrp,
  }
}

export function formatRupees(paise?: number) {
  return paise === undefined ? '—' : `₹${(paise / 100).toFixed(2)}`
}
