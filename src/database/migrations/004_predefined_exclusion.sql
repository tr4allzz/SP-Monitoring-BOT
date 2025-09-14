-- Add known high mcap tokens to exclusions
-- These tokens should be excluded from whale alerts

BEGIN;

-- Insert known high mcap Story Protocol tokens
INSERT OR IGNORE INTO token_exclusions (address, token_name, reason, market_cap, excluded_at) VALUES
-- Replace these with actual Story Protocol token addresses
('0x693c7AcF65e52C71bAFE555Bc22d69cB7f8a78a2', 'LARRY', 'high_mcap', 1000000, CURRENT_TIMESTAMP),
('0x543374350269CCe6651358769512875FAA4cCcFf', 'IPPY', 'high_mcap', 500000, CURRENT_TIMESTAMP),
('0xd1b2D3Df51c3E5a22b09993354B8717e3a7E4D3b', 'ZAZU', 'high_mcap', 300000, CURRENT_TIMESTAMP);

-- You can add more tokens here as they become established
-- Example format:
-- ('0xTOKEN_ADDRESS', 'TOKEN_NAME', 'high_mcap', ESTIMATED_MCAP, CURRENT_TIMESTAMP),

COMMIT;