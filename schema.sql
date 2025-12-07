CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  url TEXT NOT NULL,
  signed_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  owner_email TEXT -- Optional: to track who uploaded it
);

CREATE TABLE IF NOT EXISTS signers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT, -- Can be null initially until they sign
  token TEXT NOT NULL UNIQUE, -- For the secure link
  status TEXT DEFAULT 'pending', -- pending, sent, viewed, signed
  signed_at TIMESTAMP WITH TIME ZONE,
  ip_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- uploaded, invited, viewed, signed, downloaded
  actor_email TEXT, -- Who did it
  actor_ip TEXT,
  details JSONB, -- storing extra metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
