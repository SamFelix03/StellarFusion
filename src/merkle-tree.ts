import { createHash } from 'crypto';

export class MerkleTree {
    private leaves: string[];

    constructor(leaves: string[]) {
        this.leaves = [...leaves];
    }

    public getRoot(): string {
        if (this.leaves.length === 0) {
            throw new Error('No leaves');
        }
        
        if (this.leaves.length === 1) {
            return this.leaves[0];
        }
        
        if (this.leaves.length === 2) {
            return this.hashPair(this.leaves[0], this.leaves[1]);
        }
        
        if (this.leaves.length === 3) {
            // For 3 leaves: hash first two, then hash result with third
            const intermediate = this.hashPair(this.leaves[0], this.leaves[1]);
            return this.hashPair(intermediate, this.leaves[2]);
        }
        
        throw new Error('Only 1-3 leaves supported');
    }
    
    private hashPair(a: string, b: string): string {
        // Sort to ensure consistent ordering like Solidity
        if (a <= b) {
            return this.sha256Concat(a, b);
        } else {
            return this.sha256Concat(b, a);
        }
    }
    
    private sha256Concat(a: string, b: string): string {
        const hash = createHash('sha256');
        hash.update(Buffer.from(a.slice(2), 'hex'));
        hash.update(Buffer.from(b.slice(2), 'hex'));
        return '0x' + hash.digest('hex');
    }
    
    public getProof(index: number): string[] {
        if (this.leaves.length === 1) {
            return [];
        }
        
        if (this.leaves.length === 2) {
            return [this.leaves[index === 0 ? 1 : 0]];
        }
        
        if (this.leaves.length === 3) {
            if (index === 0) {
                return [this.leaves[1], this.leaves[2]];
            } else if (index === 1) {
                return [this.leaves[0], this.leaves[2]];
            } else if (index === 2) {
                // For leaf 2, proof is the intermediate hash of leaves 0 and 1
                const intermediate = this.hashPair(this.leaves[0], this.leaves[1]);
                return [intermediate];
            }
        }
        
        throw new Error('Unsupported');
    }
    
    public verifyProof(proof: string[], leaf: string, root: string): boolean {
        let computedHash = leaf;
        
        for (const proofElement of proof) {
            computedHash = this.hashPair(computedHash, proofElement);
        }
        
        return computedHash === root;
    }
}