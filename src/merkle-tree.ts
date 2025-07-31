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
        
        // Build the tree from bottom up
        let currentLevel = [...this.leaves];
        
        while (currentLevel.length > 1) {
            const nextLevel: string[] = [];
            
            for (let i = 0; i < currentLevel.length; i += 2) {
                if (i + 1 < currentLevel.length) {
                    // Hash pair of nodes
                    nextLevel.push(this.hashPair(currentLevel[i], currentLevel[i + 1]));
                } else {
                    // Odd number of nodes, promote the last one
                    nextLevel.push(currentLevel[i]);
                }
            }
            
            currentLevel = nextLevel;
        }
        
        return currentLevel[0];
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
        
        const proof: string[] = [];
        let currentIndex = index;
        let currentLevel = [...this.leaves];
        
        while (currentLevel.length > 1) {
            const nextLevel: string[] = [];
            const nextProof: string[] = [];
            
            for (let i = 0; i < currentLevel.length; i += 2) {
                if (i + 1 < currentLevel.length) {
                    // Hash pair of nodes
                    nextLevel.push(this.hashPair(currentLevel[i], currentLevel[i + 1]));
                    
                    // Add to proof if this pair contains our target
                    if (i === currentIndex || i + 1 === currentIndex) {
                        const siblingIndex = i === currentIndex ? i + 1 : i;
                        nextProof.push(currentLevel[siblingIndex]);
                    }
                } else {
                    // Odd number of nodes, promote the last one
                    nextLevel.push(currentLevel[i]);
                    if (i === currentIndex) {
                        // No sibling for the last node
                    }
                }
            }
            
            proof.push(...nextProof);
            currentLevel = nextLevel;
            currentIndex = Math.floor(currentIndex / 2);
        }
        
        return proof;
    }
    
    public verifyProof(proof: string[], leaf: string, root: string): boolean {
        let computedHash = leaf;
        
        for (const proofElement of proof) {
            computedHash = this.hashPair(computedHash, proofElement);
        }
        
        return computedHash === root;
    }
}