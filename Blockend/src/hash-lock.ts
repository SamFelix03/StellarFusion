import { createHash, randomBytes } from 'crypto';
import { MerkleTree } from './merkle-tree';

export class HashLock {
    public static Web3Type = 'bytes32';

    private readonly value: string;

    protected constructor(val: string) {
        this.value = val;
    }

    public static hashSecret(secret: string): string {
        if (!secret.startsWith('0x') || secret.length !== 66) {
            throw new Error('secret must be 32 bytes hex encoded with 0x prefix');
        }

        const hash = createHash('sha256');
        hash.update(Buffer.from(secret.slice(2), 'hex'));
        return '0x' + hash.digest('hex');
    }

    public static getMerkleLeaves(secrets: string[]): string[] {
        return HashLock.getMerkleLeavesFromSecretHashes(
            secrets.map(HashLock.hashSecret)
        );
    }

    public static getMerkleLeavesFromSecretHashes(
        secretHashes: string[]
    ): string[] {
        return secretHashes.map((secretHash, idx) => {
            const hash = createHash('sha256');
            // Pack index (8 bytes big endian) + secret hash (32 bytes) - matches Solidity abi.encodePacked
            const indexBuffer = Buffer.alloc(8);
            indexBuffer.writeBigUInt64BE(BigInt(idx), 0); // Big endian to match Solidity uint64
            const secretBuffer = Buffer.from(secretHash.slice(2), 'hex');
            
            const packed = Buffer.concat([indexBuffer, secretBuffer]);
            hash.update(packed);
            return '0x' + hash.digest('hex');
        });
    }

    public static getProof(leaves: string[], idx: number): string[] {
        const tree = new MerkleTree(leaves);
        return tree.getProof(idx);
    }

    public static fromString(value: string): HashLock {
        if (!value.startsWith('0x') || value.length !== 66) {
            throw new Error('HashLock value must be bytes32 hex encoded with 0x prefix');
        }
        return new HashLock(value);
    }

    public static forSingleFill(secret: string): HashLock {
        return new HashLock(HashLock.hashSecret(secret));
    }

    public static forMultipleFills(leaves: string[]): HashLock {
        if (leaves.length <= 2) {
            throw new Error('leaves array must be greater than 2. Or use HashLock.forSingleFill');
        }

        const tree = new MerkleTree(leaves);
        const root = tree.getRoot();
        
        // Return the merkle root directly without any modifications
        return new HashLock(root);
    }

    public static getPartsCountFromLeaves(leaves: string[]): number {
        // Helper method to get parts count from leaves array
        return leaves.length - 1;
    }

    public static verifyHashLock(hashlock: string, leaves: string[]): boolean {
        // Verify that the hashlock is the merkle root of the leaves
        const tree = new MerkleTree(leaves);
        const root = tree.getRoot();
        return hashlock === root;
    }

    public static getOriginalMerkleRoot(leaves: string[]): string {
        // Get the original merkle root from leaves (for verification)
        const tree = new MerkleTree(leaves);
        return tree.getRoot();
    }

    public getPartsCount(): number {
        // Parts count is no longer embedded in the hashlock
        // This method is kept for compatibility but should not be used
        throw new Error('Parts count is no longer embedded in hashlock. Use PartialFillOrderManager.getPartsCount() instead.');
    }

    public toString(): string {
        return this.value;
    }

    public eq(other: HashLock): boolean {
        return this.value === other.value;
    }
}


export class PartialFillOrderManager {
    private secrets: string[];
    private leaves: string[];
    private hashLock: HashLock;
    private tree: MerkleTree;
    private partsCount: number;

    constructor(partsCount: number) {
        this.partsCount = partsCount;
        this.secrets = Array.from({ length: partsCount + 1 }, () => 
            '0x' + randomBytes(32).toString('hex')
        );
        
        // Get secret hashes
        const secretHashes = this.secrets.map(s => HashLock.hashSecret(s));
        
        // Create merkle leaves from secret hashes
        this.leaves = HashLock.getMerkleLeavesFromSecretHashes(secretHashes);
        
        // Create the hashlock - just use the merkle root directly
        this.hashLock = partsCount === 1 
            ? HashLock.forSingleFill(this.secrets[0])
            : HashLock.forMultipleFills(this.leaves);
        
        // Create tree
        this.tree = new MerkleTree(this.leaves);
    }

    public getHashLock(): string {
        return this.hashLock.toString();
    }

    public getPartsCount(): number {
        return this.partsCount;
    }

    public getSecret(index: number): string {
        if (index < 0 || index >= this.secrets.length) {
            throw new Error('Invalid secret index');
        }
        return this.secrets[index];
    }

    public getProof(index: number): string[] {
        return this.tree.getProof(index);
    }

    public verifyProof(index: number, secret: string): boolean {
        const secretHash = HashLock.hashSecret(secret);
        const leaf = this.leaves[index];
        const root = this.tree.getRoot();
        const proof = this.getProof(index);
        
        return this.tree.verifyProof(proof, leaf, root);
    }

    public getSecretHash(index: number): string {
        return HashLock.hashSecret(this.getSecret(index));
    }

    public getAllSecretHashes(): string[] {
        return this.secrets.map(secret => HashLock.hashSecret(secret));
    }

    public getLeaf(index: number): string {
        if (index < 0 || index >= this.leaves.length) {
            throw new Error('Invalid leaf index');
        }
        return this.leaves[index];
    }

    public getAllLeaves(): string[] {
        return [...this.leaves];
    }

    public getAllSecrets(): string[] {
        return [...this.secrets];
    }
}