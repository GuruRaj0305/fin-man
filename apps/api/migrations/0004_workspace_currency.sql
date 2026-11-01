ALTER TABLE users ADD COLUMN currency TEXT NOT NULL DEFAULT 'INR' CHECK(length(currency)=3);
