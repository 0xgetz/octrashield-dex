/**
 * ShieldToken Client — Encrypted ERC20 Operations
 *
 * Client for the ShieldToken contract (OCS01 encrypted ERC20).
 * All balance and allowance operations handle client-side
 * HFHE encryption/decryption transparently.
 *
 * Usage:
 * ```ts
 * const token = new ShieldTokenClient(txBuilder, hfheKeyPair, tokenAddress);
 * const balance = await token.getBalance(myAddress);
 * const plaintext = token.decryptBalance(balance);
 * await token.transfer(recipient, 1000n);
 * ```
 */

import type { TransactionBuilder } from '../core/ocs01.js';
import type {
  Address,
  EncryptedU64,
  HfheKeyPair,
  TokenInfo,
  TokenBalance,
  TokenAllowance,
  TransactionReceipt,
} from '../core/types.js';
import { encrypt, decrypt, decryptValue, encryptBatch } from '../core/hfhe.js';
import { WalletNotConnected, InsufficientBalance, InsufficientAllowance } from '../core/errors.js';

export class ShieldTokenClient {
  constructor(
    private readonly tx: TransactionBuilder,
    private readonly keyPair: HfheKeyPair,
    private readonly tokenAddress: Address
  ) {}

  /**
   * Get the token contract address.
   */
  get address(): Address {
    return this.tokenAddress;
  }

  async balanceOf(holder: Address): Promise<EncryptedU64> {
    return this.tx.query<EncryptedU64>(
      this.tokenAddress,
      'view_balance_of',
      [holder]
    );
  }

  async allowance(owner: Address, spender: Address): Promise<EncryptedU64> {
    return this.tx.query<EncryptedU64>(
      this.tokenAddress,
      'view_allowance',
      [owner, spender]
    );
  }

  async mint(to: Address, amount: bigint): Promise<TransactionReceipt> {
    const encryptedAmount = encrypt(amount, this.keyPair);
    return this.tx.execute(
      this.tokenAddress,
      'call_mint',
      [to, encryptedAmount.ciphertext]
    );
  }

  async burn(amount: bigint): Promise<TransactionReceipt> {
    const encryptedAmount = encrypt(amount, this.keyPair);
    return this.tx.execute(
      this.tokenAddress,
      'call_burn',
      [encryptedAmount.ciphertext]
    );
  }

  async totalSupply(): Promise<EncryptedU64> {
    return this.tx.query<EncryptedU64>(
      this.tokenAddress,
      'view_total_supply'
    );
  }

  //

  // --------------------------------------------------------------------------
  // View Methods (read-only, no signature)
  // --------------------------------------------------------------------------

  /**
   * Get token metadata: name, symbol, decimals, total supply.
   */
  async getTokenInfo(): Promise<TokenInfo> {
    const [name, symbol, decimals, totalSupply] = await Promise.all([
      this.tx.query<string>(this.tokenAddress, 'view_name'),
      this.tx.query<string>(this.tokenAddress, 'view_symbol'),
      this.tx.query<number>(this.tokenAddress, 'view_decimals'),
      this.tx.query<EncryptedU64>(this.tokenAddress, 'view_total_supply'),
    ]);

    return {
      address: this.tokenAddress,
      name,
      symbol,
      decimals,
      totalSupply,
    };
  }

  /**
   * Get the encrypted balance for an address.
   * Only the address holder can decrypt the actual value.
   */
  async getBalance(holder: Address): Promise<TokenBalance> {
    const encryptedBalance = await this.tx.query<EncryptedU64>(
      this.tokenAddress,
      'view_balance_of',
      [holder]
    );

    return {
      token: this.tokenAddress,
      holder,
      encryptedBalance,
    };
  }

  /**
   * Get the encrypted allowance for a spender.
   */
  async getAllowance(owner: Address, spender: Address): Promise<TokenAllowance> {
    const encryptedAllowance = await this.tx.query<EncryptedU64>(
      this.tokenAddress,
      'view_allowance',
      [owner, spender]
    );

    return {
      token: this.tokenAddress,
      owner,
      spender,
      encryptedAllowance,
    };
  }

  // --------------------------------------------------------------------------
  // Decryption Helpers (client-side only)
  // --------------------------------------------------------------------------

  /**
   * Decrypt a balance using the local HFHE key pair.
   * Only works if the key pair belongs to the balance holder.
   */
  decryptBalance(balance: TokenBalance): bigint {
    return decryptValue(balance.encryptedBalance, this.keyPair);
  }

  /**
   * Decrypt an allowance using the local HFHE key pair.
   */
  decryptAllowance(allowance: TokenAllowance): bigint {
    return decryptValue(allowance.encryptedAllowance, this.keyPair);
  }

  // --------------------------------------------------------------------------
  // Call Methods (signed, state-mutating)
  // --------------------------------------------------------------------------

  /**
   * Transfer encrypted tokens to a recipient.
   *
   * The amount is encrypted client-side before submission.
   * The contract performs the transfer entirely on ciphertexts.
   *
   * @param to - Recipient address
   * @param amount - Plaintext amount to transfer
   * @returns Transaction receipt
   */
  async transfer(to: Address, amount: bigint): Promise<TransactionReceipt> {
    const encryptedAmount = encrypt(amount, this.keyPair);

    return this.tx.execute(
      this.tokenAddress,
      'call_transfer',
      [to, encryptedAmount.ciphertext]
    );
  }

  /**
   * Approve a spender to transfer tokens on behalf of the owner.
   *
   * @param spender - Address allowed to spend tokens
   * @param amount - Maximum plaintext amount the spender can transfer
   * @returns Transaction receipt
   */
  async approve(spender: Address, amount: bigint): Promise<TransactionReceipt> {
    const encryptedAmount = encrypt(amount, this.keyPair);

    return this.tx.execute(
      this.tokenAddress,
      'call_approve',
      [spender, encryptedAmount.ciphertext]
    );
  }

  /**
   * Transfer tokens from one address to another (requires allowance).
   *
   * @param from - Source address
   * @param to - Destination address
   * @param amount - Plaintext amount to transfer
   * @returns Transaction receipt
   */
  async transferFrom(
    from: Address,
    to: Address,
    amount: bigint
  ): Promise<TransactionReceipt> {
    const encryptedAmount = encrypt(amount, this.keyPair);

    return this.tx.execute(
      this.tokenAddress,
      'call_transfer_from',
      [from, to, encryptedAmount.ciphertext]
    );
  }

  /**
   * Increase allowance for a spender (avoids approve front-running).
   */
  async increaseAllowance(spender: Address, addedAmount: bigint): Promise<TransactionReceipt> {
    const encryptedAmount = encrypt(addedAmount, this.keyPair);

    return this.tx.execute(
      this.tokenAddress,
      'call_increase_allowance',
      [spender, encryptedAmount.ciphertext]
    );
  }

  /**
   * Decrease allowance for a spender.
   */
  async decreaseAllowance(spender: Address, subtractedAmount: bigint): Promise<TransactionReceipt> {
    const encryptedAmount = encrypt(subtractedAmount, this.keyPair);

    return this.tx.execute(
      this.tokenAddress,
      'call_decrease_allowance',
      [spender, encryptedAmount.ciphertext]
    );
  }

  // --------------------------------------------------------------------------
  // Convenience Methods
  // --------------------------------------------------------------------------

  /**
   * Get and decrypt the balance for the connected wallet.
   */
  async getMyBalance(): Promise<{ encrypted: EncryptedU64; plaintext: bigint }> {
    const signer = this.tx.getSignerAddress();
    const balance = await this.getBalance(signer);
    const plaintext = this.decryptBalance(balance);
    return { encrypted: balance.encryptedBalance, plaintext };
  }

  /**
   * Approve maximum amount (unlimited allowance).
   */
  async approveMax(spender: Address): Promise<TransactionReceipt> {
    // Max value in the Mersenne prime field
    const maxAmount = 2305843009213693950n; // MERSENNE_PRIME - 1
    return this.approve(spender, maxAmount);
  }

  /**
   * Check if a spender has sufficient allowance, and approve if not.
   * Returns true if approval was needed and executed.
   */
  async ensureAllowance(
    spender: Address,
    requiredAmount: bigint
  ): Promise<{ approved: boolean; receipt?: TransactionReceipt }> {
    const signer = this.tx.getSignerAddress();
    const allowance = await this.getAllowance(signer, spender);
    const currentAllowance = this.decryptAllowance(allowance);

    if (currentAllowance >= requiredAmount) {
      return { approved: false };
    }

    const receipt = await this.approveMax(spender);
    return { approved: true, receipt };
  }
}
