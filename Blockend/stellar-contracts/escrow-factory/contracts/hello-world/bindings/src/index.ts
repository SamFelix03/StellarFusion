import { Buffer } from "buffer";
import { Address } from '@stellar/stellar-sdk';
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from '@stellar/stellar-sdk/contract';
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Typepoint,
  Duration,
} from '@stellar/stellar-sdk/contract';
export * from '@stellar/stellar-sdk'
export * as contract from '@stellar/stellar-sdk/contract'
export * as rpc from '@stellar/stellar-sdk/rpc'

if (typeof window !== 'undefined') {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}


export const networks = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CCFLX4NZH4MVTQ5DYO74LEB3S7U2GO6OH3VP4NPYF4CXXSXR4GPRXEXV",
  }
} as const


export interface FilledOrder {
  escrow_address: string;
  is_active: boolean;
  maker: string;
  order_hash: Buffer;
  part_index: u64;
  recipient: string;
  total_parts: u32;
}


export interface OrderParams {
  cancellation_start: u64;
  hashed_secret: Buffer;
  part_index: u64;
  public_withdrawal_start: u64;
  token_amount: i128;
  total_parts: u32;
  withdrawal_start: u64;
}

export type DataKey = {tag: "FilledOrders", values: readonly [Buffer]} | {tag: "PartsFilled", values: readonly [Buffer, u64]} | {tag: "FilledSegmentsCount", values: readonly [Buffer]} | {tag: "UserFilledOrders", values: readonly [string]} | {tag: "EscrowFactory", values: void} | {tag: "Owner", values: void} | {tag: "TokenAllowance", values: readonly [string, string]};

export interface Client {
  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Initialize the protocol with the escrow factory address and owner
   */
  initialize: ({escrow_factory, owner}: {escrow_factory: string, owner: string}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a approve transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Approve LOP to spend tokens (equivalent to ERC20 approve() in EVM)
   * This allows the LOP to transfer tokens on behalf of the caller
   */
  approve: ({caller, amount}: {caller: string, amount: i128}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a allowance transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get current allowance (equivalent to ERC20 allowance() in EVM)
   */
  allowance: ({owner, spender}: {owner: string, spender: string}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a fill_order transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Fill an order by creating an escrow - supports non-sequential partial fills
   */
  fill_order: ({order_hash, maker, recipient, token_amount, hashed_secret, withdrawal_start, public_withdrawal_start, part_index, total_parts}: {order_hash: Buffer, maker: string, recipient: string, token_amount: i128, hashed_secret: Buffer, withdrawal_start: u64, public_withdrawal_start: u64, part_index: u64, total_parts: u32}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a cancel_order transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Cancel a specific order part by calling the escrow's cancel function
   */
  cancel_order: ({caller, order_hash, part_index}: {caller: string, order_hash: Buffer, part_index: u64}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_order transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get all filled order parts
   */
  get_order: ({order_hash}: {order_hash: Buffer}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Array<FilledOrder>>>

  /**
   * Construct and simulate a get_order_part transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get specific filled order part
   */
  get_order_part: ({order_hash, part_index}: {order_hash: Buffer, part_index: u64}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<FilledOrder>>

  /**
   * Construct and simulate a get_remaining_segments transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get remaining segments for an order
   */
  get_remaining_segments: ({order_hash, total_parts}: {order_hash: Buffer, total_parts: u32}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<u64>>

  /**
   * Construct and simulate a is_part_available transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Check if a specific part index is available for partial fill
   */
  is_part_available: ({order_hash, part_index}: {order_hash: Buffer, part_index: u64}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a get_available_part_indices transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get all available part indices for an order
   */
  get_available_part_indices: ({order_hash, total_parts}: {order_hash: Buffer, total_parts: u32}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Array<u64>>>

  /**
   * Construct and simulate a get_user_filled_orders transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get all filled orders for a user
   */
  get_user_filled_orders: ({user}: {user: string}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Array<Buffer>>>

  /**
   * Construct and simulate a rescue_xlm transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Emergency function to rescue XLM stuck in contract
   */
  rescue_xlm: ({caller, to}: {caller: string, to: string}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<null>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAQAAAAAAAAAAAAAAC0ZpbGxlZE9yZGVyAAAAAAcAAAAAAAAADmVzY3Jvd19hZGRyZXNzAAAAAAATAAAAAAAAAAlpc19hY3RpdmUAAAAAAAABAAAAAAAAAAVtYWtlcgAAAAAAABMAAAAAAAAACm9yZGVyX2hhc2gAAAAAA+4AAAAgAAAAAAAAAApwYXJ0X2luZGV4AAAAAAAGAAAAAAAAAAlyZWNpcGllbnQAAAAAAAATAAAAAAAAAAt0b3RhbF9wYXJ0cwAAAAAE",
        "AAAAAQAAAAAAAAAAAAAAC09yZGVyUGFyYW1zAAAAAAcAAAAAAAAAEmNhbmNlbGxhdGlvbl9zdGFydAAAAAAABgAAAAAAAAANaGFzaGVkX3NlY3JldAAAAAAAA+4AAAAgAAAAAAAAAApwYXJ0X2luZGV4AAAAAAAGAAAAAAAAABdwdWJsaWNfd2l0aGRyYXdhbF9zdGFydAAAAAAGAAAAAAAAAAx0b2tlbl9hbW91bnQAAAALAAAAAAAAAAt0b3RhbF9wYXJ0cwAAAAAEAAAAAAAAABB3aXRoZHJhd2FsX3N0YXJ0AAAABg==",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABwAAAAEAAAAAAAAADEZpbGxlZE9yZGVycwAAAAEAAAPuAAAAIAAAAAEAAAAAAAAAC1BhcnRzRmlsbGVkAAAAAAIAAAPuAAAAIAAAAAYAAAABAAAAAAAAABNGaWxsZWRTZWdtZW50c0NvdW50AAAAAAEAAAPuAAAAIAAAAAEAAAAAAAAAEFVzZXJGaWxsZWRPcmRlcnMAAAABAAAAEwAAAAAAAAAAAAAADUVzY3Jvd0ZhY3RvcnkAAAAAAAAAAAAAAAAAAAVPd25lcgAAAAAAAAEAAAAAAAAADlRva2VuQWxsb3dhbmNlAAAAAAACAAAAEwAAABM=",
        "AAAAAAAAAEFJbml0aWFsaXplIHRoZSBwcm90b2NvbCB3aXRoIHRoZSBlc2Nyb3cgZmFjdG9yeSBhZGRyZXNzIGFuZCBvd25lcgAAAAAAAAppbml0aWFsaXplAAAAAAACAAAAAAAAAA5lc2Nyb3dfZmFjdG9yeQAAAAAAEwAAAAAAAAAFb3duZXIAAAAAAAATAAAAAA==",
        "AAAAAAAAAIFBcHByb3ZlIExPUCB0byBzcGVuZCB0b2tlbnMgKGVxdWl2YWxlbnQgdG8gRVJDMjAgYXBwcm92ZSgpIGluIEVWTSkKVGhpcyBhbGxvd3MgdGhlIExPUCB0byB0cmFuc2ZlciB0b2tlbnMgb24gYmVoYWxmIG9mIHRoZSBjYWxsZXIAAAAAAAAHYXBwcm92ZQAAAAACAAAAAAAAAAZjYWxsZXIAAAAAABMAAAAAAAAABmFtb3VudAAAAAAACwAAAAA=",
        "AAAAAAAAAD5HZXQgY3VycmVudCBhbGxvd2FuY2UgKGVxdWl2YWxlbnQgdG8gRVJDMjAgYWxsb3dhbmNlKCkgaW4gRVZNKQAAAAAACWFsbG93YW5jZQAAAAAAAAIAAAAAAAAABW93bmVyAAAAAAAAEwAAAAAAAAAHc3BlbmRlcgAAAAATAAAAAQAAAAs=",
        "AAAAAAAAAEtGaWxsIGFuIG9yZGVyIGJ5IGNyZWF0aW5nIGFuIGVzY3JvdyAtIHN1cHBvcnRzIG5vbi1zZXF1ZW50aWFsIHBhcnRpYWwgZmlsbHMAAAAACmZpbGxfb3JkZXIAAAAAAAkAAAAAAAAACm9yZGVyX2hhc2gAAAAAA+4AAAAgAAAAAAAAAAVtYWtlcgAAAAAAABMAAAAAAAAACXJlY2lwaWVudAAAAAAAABMAAAAAAAAADHRva2VuX2Ftb3VudAAAAAsAAAAAAAAADWhhc2hlZF9zZWNyZXQAAAAAAAPuAAAAIAAAAAAAAAAQd2l0aGRyYXdhbF9zdGFydAAAAAYAAAAAAAAAF3B1YmxpY193aXRoZHJhd2FsX3N0YXJ0AAAAAAYAAAAAAAAACnBhcnRfaW5kZXgAAAAAAAYAAAAAAAAAC3RvdGFsX3BhcnRzAAAAAAQAAAABAAAAEw==",
        "AAAAAAAAAERDYW5jZWwgYSBzcGVjaWZpYyBvcmRlciBwYXJ0IGJ5IGNhbGxpbmcgdGhlIGVzY3JvdydzIGNhbmNlbCBmdW5jdGlvbgAAAAxjYW5jZWxfb3JkZXIAAAADAAAAAAAAAAZjYWxsZXIAAAAAABMAAAAAAAAACm9yZGVyX2hhc2gAAAAAA+4AAAAgAAAAAAAAAApwYXJ0X2luZGV4AAAAAAAGAAAAAA==",
        "AAAAAAAAABpHZXQgYWxsIGZpbGxlZCBvcmRlciBwYXJ0cwAAAAAACWdldF9vcmRlcgAAAAAAAAEAAAAAAAAACm9yZGVyX2hhc2gAAAAAA+4AAAAgAAAAAQAAA+oAAAfQAAAAC0ZpbGxlZE9yZGVyAA==",
        "AAAAAAAAAB5HZXQgc3BlY2lmaWMgZmlsbGVkIG9yZGVyIHBhcnQAAAAAAA5nZXRfb3JkZXJfcGFydAAAAAAAAgAAAAAAAAAKb3JkZXJfaGFzaAAAAAAD7gAAACAAAAAAAAAACnBhcnRfaW5kZXgAAAAAAAYAAAABAAAH0AAAAAtGaWxsZWRPcmRlcgA=",
        "AAAAAAAAACNHZXQgcmVtYWluaW5nIHNlZ21lbnRzIGZvciBhbiBvcmRlcgAAAAAWZ2V0X3JlbWFpbmluZ19zZWdtZW50cwAAAAAAAgAAAAAAAAAKb3JkZXJfaGFzaAAAAAAD7gAAACAAAAAAAAAAC3RvdGFsX3BhcnRzAAAAAAQAAAABAAAABg==",
        "AAAAAAAAADxDaGVjayBpZiBhIHNwZWNpZmljIHBhcnQgaW5kZXggaXMgYXZhaWxhYmxlIGZvciBwYXJ0aWFsIGZpbGwAAAARaXNfcGFydF9hdmFpbGFibGUAAAAAAAACAAAAAAAAAApvcmRlcl9oYXNoAAAAAAPuAAAAIAAAAAAAAAAKcGFydF9pbmRleAAAAAAABgAAAAEAAAAB",
        "AAAAAAAAACtHZXQgYWxsIGF2YWlsYWJsZSBwYXJ0IGluZGljZXMgZm9yIGFuIG9yZGVyAAAAABpnZXRfYXZhaWxhYmxlX3BhcnRfaW5kaWNlcwAAAAAAAgAAAAAAAAAKb3JkZXJfaGFzaAAAAAAD7gAAACAAAAAAAAAAC3RvdGFsX3BhcnRzAAAAAAQAAAABAAAD6gAAAAY=",
        "AAAAAAAAACBHZXQgYWxsIGZpbGxlZCBvcmRlcnMgZm9yIGEgdXNlcgAAABZnZXRfdXNlcl9maWxsZWRfb3JkZXJzAAAAAAABAAAAAAAAAAR1c2VyAAAAEwAAAAEAAAPqAAAD7gAAACA=",
        "AAAAAAAAADJFbWVyZ2VuY3kgZnVuY3Rpb24gdG8gcmVzY3VlIFhMTSBzdHVjayBpbiBjb250cmFjdAAAAAAACnJlc2N1ZV94bG0AAAAAAAIAAAAAAAAABmNhbGxlcgAAAAAAEwAAAAAAAAACdG8AAAAAABMAAAAA" ]),
      options
    )
  }
  public readonly fromJSON = {
    initialize: this.txFromJSON<null>,
        approve: this.txFromJSON<null>,
        allowance: this.txFromJSON<i128>,
        fill_order: this.txFromJSON<string>,
        cancel_order: this.txFromJSON<null>,
        get_order: this.txFromJSON<Array<FilledOrder>>,
        get_order_part: this.txFromJSON<FilledOrder>,
        get_remaining_segments: this.txFromJSON<u64>,
        is_part_available: this.txFromJSON<boolean>,
        get_available_part_indices: this.txFromJSON<Array<u64>>,
        get_user_filled_orders: this.txFromJSON<Array<Buffer>>,
        rescue_xlm: this.txFromJSON<null>
  }
}