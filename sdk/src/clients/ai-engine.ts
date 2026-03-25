/**
 * AI Engine Client — Dynamic Fees, MEV Shield & Rebalancing
 *
 * Client for the OctraShieldAI contract running inside an Octra Circle.
 * Queries AI-computed fee adjustments, MEV detection alerts,
 * volatility metrics, and liquidity rebalancing suggestions.
 *
 * Usage:
 * ```ts
 * const ai = new AIEngineClient(txBuilder, hfheKeyPair, aiAddress);
 * const fee = await ai.getDynamicFee(poolId);
 * const alerts = await ai.getMevAlerts(poolId);
 * const suggestions = await ai.getRebalanceSuggestions(myPositionId);
 * ```
 */

import type { TransactionBuilder } from '../core/ocs01.js';
import type {
  Address,
  PoolId,
  PositionId,
  EncryptedU64,
  HfheKeyPair,
  DynamicFee,
  VolatilityData,
  MevAlert,
  MevAlertType,
  MevRecommendation,
  RebalanceSuggestion,
  TransactionReceipt,
} from '../core/types.js';
import { decryptValue } from '../core/hfhe.js';
import { AI_MEV_THRESHOLD_BPS } from '../core/constants.js';

/**
 * AI Engine health status.
 */
export interface AIHealthStatus {
  readonly circleId: string;
  readonly isOnline: boolean;
  readonly lastUpdateBlock: bigint;
  readonly modelVersion: string;
  readonly poolsMonitored: number;
  readonly totalAlertsIssued: number;
}

/**
 * Pool risk assessment from the AI engine.
 */
export interface PoolRiskAssessment {
  readonly poolId: PoolId;
  readonly riskLevel: 'low' | 'medium' | 'high' | 'critical';
  readonly riskScore: number; // 0-10000 bps
  readonly factors: readonly string[];
  readonly recommendation: string;
}

export class AIEngineClient {
  constructor(
    private readonly tx: TransactionBuilder,
    private readonly keyPair: HfheKeyPair,
    private readonly aiAddress: Address
  ) {}

  // --------------------------------------------------------------------------
  // View Methods — Dynamic Fees
  // --------------------------------------------------------------------------

  /**
   * Get the AI-adjusted dynamic fee for a pool.
   * The AI analyzes encrypted volatility and volume to recommend fee changes.
   */
  async getDynamicFee(poolId: PoolId): Promise<DynamicFee> {
    return this.tx.viewCall<DynamicFee>(
      this.aiAddress,
      'view_dynamic_fee',
      [poolId]
    );
  }

  /**
   * Get dynamic fees for multiple pools at once.
   */
  async getDynamicFees(poolIds: readonly PoolId[]): Promise<DynamicFee[]> {
    return this.tx.viewCall<DynamicFee[]>(
      this.aiAddress,
      'view_dynamic_fees_batch',
      [poolIds]
    );
  }

  /**
   * Decrypt the adjusted fee to see the plaintext value.
   */
  decryptFee(fee: DynamicFee): { baseFee: bigint; adjustedFee: bigint } {
    return {
      baseFee: decryptValue(fee.baseFee, this.keyPair),
      adjustedFee: decryptValue(fee.adjustedFee, this.keyPair),
    };
  }

  // --------------------------------------------------------------------------
  // View Methods — Volatility
  // --------------------------------------------------------------------------

  /**
   * Get encrypted volatility data for a pool.
   * The AI computes EMA volatility from encrypted trade data.
   */
  async getVolatility(poolId: PoolId): Promise<VolatilityData> {
    return this.tx.viewCall<VolatilityData>(
      this.aiAddress,
      'view_volatility',
      [poolId]
    );
  }

  /**
   * Decrypt volatility metrics.
   */
  decryptVolatility(vol: VolatilityData): {
    emaVolatility: bigint;
    shortTermVol: bigint;
    longTermVol: bigint;
    volRatio: bigint;
  } {
    return {
      emaVolatility: decryptValue(vol.emaVolatility, this.keyPair),
      shortTermVol: decryptValue(vol.shortTermVol, this.keyPair),
      longTermVol: decryptValue(vol.longTermVol, this.keyPair),
      volRatio: decryptValue(vol.volRatio, this.keyPair),
    };
  }

  // --------------------------------------------------------------------------
  // View Methods — MEV Detection
  // --------------------------------------------------------------------------

  /**
   * Get active MEV alerts for a pool.
   * The AI monitors for sandwich attacks, frontrunning, and manipulation.
   */
  async getMevAlerts(poolId: PoolId): Promise<MevAlert[]> {
    return this.tx.viewCall<MevAlert[]>(
      this.aiAddress,
      'view_mev_alerts',
      [poolId]
    );
  }

  /**
   * Check if a specific transaction is flagged for MEV.
   */
  async checkTransactionMev(txData: string): Promise<{
    isSuspicious: boolean;
    alertType: MevAlertType | null;
    score: number;
    recommendation: MevRecommendation;
  }> {
    return this.tx.viewCall(
      this.aiAddress,
      'view_check_mev',
      [txData]
    );
  }

  /**
   * Get the MEV protection status for the connected wallet.
   * Shows if any pending transactions are being shielded.
   */
  async getMevProtectionStatus(): Promise<{
    isProtected: boolean;
    pendingShieldedTxs: number;
    blockedAttacks: number;
  }> {
    const signer = this.tx.getSignerAddress();
    return this.tx.viewCall(
      this.aiAddress,
      'view_mev_protection_status',
      [signer]
    );
  }

  // --------------------------------------------------------------------------
  // View Methods — Rebalancing
  // --------------------------------------------------------------------------

  /**
   * Get AI-generated rebalancing suggestions for a position.
   * The AI analyzes market conditions and recommends tick range adjustments.
   */
  async getRebalanceSuggestions(positionId: PositionId): Promise<RebalanceSuggestion[]> {
    return this.tx.viewCall<RebalanceSuggestion[]>(
      this.aiAddress,
      'view_rebalance_suggestions',
      [positionId]
    );
  }

  /**
   * Get rebalancing suggestions for all positions of the connected wallet.
   */
  async getMyRebalanceSuggestions(): Promise<RebalanceSuggestion[]> {
    const signer = this.tx.getSignerAddress();
    return this.tx.viewCall<RebalanceSuggestion[]>(
      this.aiAddress,
      'view_rebalance_suggestions_for_owner',
      [signer]
    );
  }

  // --------------------------------------------------------------------------
  // View Methods — Risk Assessment
  // --------------------------------------------------------------------------

  /**
   * Get an AI risk assessment for a pool.
   * Evaluates liquidity depth, volatility, MEV exposure, and concentration.
   */
  async getPoolRisk(poolId: PoolId): Promise<PoolRiskAssessment> {
    return this.tx.viewCall<PoolRiskAssessment>(
      this.aiAddress,
      'view_pool_risk',
      [poolId]
    );
  }

  /**
   * Get the AI engine health and operational status.
   */
  async getHealthStatus(): Promise<AIHealthStatus> {
    return this.tx.viewCall<AIHealthStatus>(
      this.aiAddress,
      'view_health_status'
    );
  }

  // --------------------------------------------------------------------------
  // Call Methods — AI Configuration (Admin/Governance)
  // --------------------------------------------------------------------------

  /**
   * Submit a price observation to the AI engine.
   * Called by the Pair contract after each swap.
   * Can also be called manually to provide additional data points.
   */
  async submitObservation(
    poolId: PoolId,
    tick: number,
    liquidity: bigint,
    volume: bigint
  ): Promise<TransactionReceipt> {
    return this.tx.callTransaction(
      this.aiAddress,
      'call_submit_observation',
      [poolId, tick, liquidity.toString(), volume.toString()]
    );
  }

  /**
   * Request the AI to recalculate dynamic fees for a pool.
   * Triggers an immediate fee update cycle.
   */
  async requestFeeUpdate(poolId: PoolId): Promise<TransactionReceipt> {
    return this.tx.callTransaction(
      this.aiAddress,
      'call_request_fee_update',
      [poolId]
    );
  }

  /**
   * Report a suspected MEV attack.
   * Provides evidence for the AI to analyze and potentially block.
   */
  async reportMevSuspicion(
    poolId: PoolId,
    suspectedTxHashes: readonly string[],
    evidence: string
  ): Promise<TransactionReceipt> {
    return this.tx.callTransaction(
      this.aiAddress,
      'call_report_mev',
      [poolId, suspectedTxHashes, evidence]
    );
  }

  // --------------------------------------------------------------------------
  // Convenience Methods
  // --------------------------------------------------------------------------

  /**
   * Check if a pool is safe to swap in right now.
   * Combines MEV alerts, volatility, and risk assessment.
   */
  async isPoolSafe(poolId: PoolId): Promise<{
    safe: boolean;
    reason: string;
    riskLevel: string;
    activeMevAlerts: number;
  }> {
    const [alerts, risk] = await Promise.all([
      this.getMevAlerts(poolId),
      this.getPoolRisk(poolId),
    ]);

    const highSeverityAlerts = alerts.filter(a => a.suspicionScore >= AI_MEV_THRESHOLD_BPS);
    const safe = highSeverityAlerts.length === 0 && risk.riskLevel !== 'critical';

    let reason = 'Pool is safe for trading.';
    if (highSeverityAlerts.length > 0) {
      reason = `${highSeverityAlerts.length} active MEV alert(s): ${highSeverityAlerts.map(a => a.alertType).join(', ')}`;
    } else if (risk.riskLevel === 'critical') {
      reason = `Pool risk is critical: ${risk.factors.join(', ')}`;
    } else if (risk.riskLevel === 'high') {
      reason = `Pool risk is elevated: ${risk.factors.join(', ')}`;
    }

    return {
      safe,
      reason,
      riskLevel: risk.riskLevel,
      activeMevAlerts: highSeverityAlerts.length,
    };
  }

  /**
   * Get a complete AI dashboard for a pool.
   * Combines fees, volatility, MEV, and risk data.
   */
  async getPoolDashboard(poolId: PoolId): Promise<{
    dynamicFee: DynamicFee;
    volatility: VolatilityData;
    mevAlerts: MevAlert[];
    risk: PoolRiskAssessment;
    isSafe: boolean;
  }> {
    const [dynamicFee, volatility, mevAlerts, risk] = await Promise.all([
      this.getDynamicFee(poolId),
      this.getVolatility(poolId),
      this.getMevAlerts(poolId),
      this.getPoolRisk(poolId),
    ]);

    const highAlerts = mevAlerts.filter(a => a.suspicionScore >= AI_MEV_THRESHOLD_BPS);
    const isSafe = highAlerts.length === 0 && risk.riskLevel !== 'critical';

    return { dynamicFee, volatility, mevAlerts, risk, isSafe };
  }
}
