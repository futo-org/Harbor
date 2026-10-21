package polycentric

import (
	"crypto/ed25519"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"sync"
	"time"
)

// Token lifetime matches the Harbor client (rs-core query/auth.rs).
const tokenLifetime = time.Hour

type tokenCache struct {
	mu     sync.Mutex
	tokens map[string]cachedToken
}

type cachedToken struct {
	token string
	exp   time.Time
}

var tokens = tokenCache{tokens: map[string]cachedToken{}}

// AuthToken returns a bearer JWT for audience (the server URL exactly as
// dialed), cached and renewed a minute before expiry like the app does.
func (a *Account) AuthToken(audience string) string {
	key := a.identity + "|" + audience
	now := time.Now()
	tokens.mu.Lock()
	if t, ok := tokens.tokens[key]; ok && now.Before(t.exp.Add(-time.Minute)) {
		tokens.mu.Unlock()
		return t.token
	}
	tokens.mu.Unlock()
	tok := MintJWT(a.priv, a.identity, audience, now, now.Add(tokenLifetime))
	tokens.mu.Lock()
	tokens.tokens[key] = cachedToken{token: tok, exp: now.Add(tokenLifetime)}
	tokens.mu.Unlock()
	return tok
}

// MintJWT signs an EdDSA JWT: kid is the hex public key, iss the identity.
func MintJWT(priv ed25519.PrivateKey, identity, audience string, iat, exp time.Time) string {
	enc := base64.RawURLEncoding
	header, _ := json.Marshal(struct {
		Alg string `json:"alg"`
		Typ string `json:"typ"`
		Kid string `json:"kid"`
	}{"EdDSA", "JWT", hex.EncodeToString(priv.Public().(ed25519.PublicKey))})
	claims, _ := json.Marshal(struct {
		Iss string `json:"iss"`
		Aud string `json:"aud"`
		Iat int64  `json:"iat"`
		Exp int64  `json:"exp"`
	}{identity, audience, iat.Unix(), exp.Unix()})
	input := enc.EncodeToString(header) + "." + enc.EncodeToString(claims)
	return input + "." + enc.EncodeToString(ed25519.Sign(priv, []byte(input)))
}
