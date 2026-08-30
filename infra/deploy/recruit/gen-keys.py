#!/usr/bin/env python3
"""Generate the secrets block for .env (JWT secret + anon/service_role keys).
Usage: python3 gen-keys.py >> .env   (then fill the remaining vars)"""
import base64, hmac, hashlib, json, secrets, time

def b64url(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()

def sign(payload: dict, secret: str) -> str:
    header = b64url(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    body = b64url(json.dumps(payload).encode())
    sig = b64url(hmac.new(secret.encode(), f"{header}.{body}".encode(), hashlib.sha256).digest())
    return f"{header}.{body}.{sig}"

jwt_secret = secrets.token_urlsafe(48)
pg_pass = secrets.token_urlsafe(24)
iat = int(time.time())
exp = iat + 10 * 365 * 24 * 3600  # 10 years
mk = lambda role: sign({"role": role, "iss": "supabase", "iat": iat, "exp": exp}, jwt_secret)

print(f"POSTGRES_PASSWORD={pg_pass}")
print(f"JWT_SECRET={jwt_secret}")
print(f"ANON_KEY={mk('anon')}")
print(f"SERVICE_ROLE_KEY={mk('service_role')}")
