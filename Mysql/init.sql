
CREATE DATABASE IF NOT EXISTS zameen;
USE zameen;

CREATE TABLE IF NOT EXISTS property_data (
    id INT AUTO_INCREMENT PRIMARY KEY,
    prop_type VARCHAR(50),
    purpose VARCHAR(50),
    covered_area FLOAT,
    price BIGINT,
    location VARCHAR(255),
    beds INT,
    baths INT,
    amenities TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

