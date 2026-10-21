package polycentric

import "crypto/sha256"

// MerkleRoot is the RFC 6962 Merkle tree hash over leaves (event signatures
// in collection order): leaf = SHA256(0x00 || l), node = SHA256(0x01 || L || R),
// split at the largest power of two smaller than n.
func MerkleRoot(leaves [][]byte) [32]byte {
	if len(leaves) == 0 {
		return sha256.Sum256(nil)
	}
	if len(leaves) == 1 {
		return leafHash(leaves[0])
	}
	k := 1
	for k*2 < len(leaves) {
		k *= 2
	}
	return nodeHash(MerkleRoot(leaves[:k]), MerkleRoot(leaves[k:]))
}

func leafHash(l []byte) [32]byte {
	buf := make([]byte, 0, 1+len(l))
	buf = append(buf, 0x00)
	buf = append(buf, l...)
	return sha256.Sum256(buf)
}

func nodeHash(l, r [32]byte) [32]byte {
	var buf [65]byte
	buf[0] = 0x01
	copy(buf[1:33], l[:])
	copy(buf[33:], r[:])
	return sha256.Sum256(buf[:])
}

// Frontier maintains an RFC 6962 tree incrementally: the roots of the
// perfect subtrees given by the binary decomposition of the leaf count, in
// decreasing size. The tree hash is their right fold, so appending costs
// O(log n) and nothing but the frontier needs to be kept.
type Frontier struct {
	Sizes  []uint64
	Hashes [][32]byte
}

func (f *Frontier) Len() uint64 {
	var n uint64
	for _, s := range f.Sizes {
		n += s
	}
	return n
}

// Append adds one leaf.
func (f *Frontier) Append(leaf []byte) {
	f.Sizes = append(f.Sizes, 1)
	f.Hashes = append(f.Hashes, leafHash(leaf))
	for n := len(f.Sizes); n >= 2 && f.Sizes[n-1] == f.Sizes[n-2]; n = len(f.Sizes) {
		merged := nodeHash(f.Hashes[n-2], f.Hashes[n-1])
		f.Sizes = append(f.Sizes[:n-2], f.Sizes[n-2]*2)
		f.Hashes = append(f.Hashes[:n-2], merged)
	}
}

// Root is the tree hash over every appended leaf (MerkleRoot of them).
func (f *Frontier) Root() [32]byte {
	n := len(f.Hashes)
	if n == 0 {
		return sha256.Sum256(nil)
	}
	root := f.Hashes[n-1]
	for i := n - 2; i >= 0; i-- {
		root = nodeHash(f.Hashes[i], root)
	}
	return root
}
