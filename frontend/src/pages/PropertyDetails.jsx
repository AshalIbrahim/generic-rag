import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Box, Card, CardContent, Chip, CircularProgress, Typography } from "@mui/material";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

export default function PropertyDetails() {
  const { id } = useParams();
  const [property, setProperty] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchProperty() {
      try {
        setLoading(true);
        setError("");
        const resp = await fetch(`${API}/listings/${id}`);
        if (!resp.ok) {
          throw new Error("Property not found");
        }
        const data = await resp.json();
        setProperty(data);
      } catch (e) {
        setError(e.message || "Failed to load property");
      } finally {
        setLoading(false);
      }
    }
    fetchProperty();
  }, [id]);

  const formatPrice = (p) => {
    const num = Number(p);
    if (Number.isNaN(num)) return p || "N/A";
    return num.toLocaleString(undefined, {
      style: "currency",
      currency: "PKR",
      maximumFractionDigits: 0,
    });
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !property) {
    return <Typography color="error">{error || "Property not found"}</Typography>;
  }

  return (
    <Card sx={{ borderRadius: 3, boxShadow: 4 }}>
      <CardContent>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
          Property #{property.id}
        </Typography>
        <Typography sx={{ mb: 1 }}><strong>Price:</strong> {formatPrice(property.price)}</Typography>
        <Typography sx={{ mb: 1 }}><strong>Type:</strong> {property.prop_type || "N/A"}</Typography>
        <Typography sx={{ mb: 1 }}><strong>Purpose:</strong> {property.purpose || "N/A"}</Typography>
        <Typography sx={{ mb: 1 }}><strong>Location:</strong> {property.location || "N/A"}</Typography>
        <Typography sx={{ mb: 1 }}><strong>Covered Area:</strong> {property.covered_area ?? "N/A"}</Typography>
        <Typography sx={{ mb: 1 }}><strong>Beds:</strong> {property.beds ?? "N/A"}</Typography>
        <Typography sx={{ mb: 1 }}><strong>Baths:</strong> {property.baths ?? "N/A"}</Typography>
        <Typography sx={{ mb: 1 }}><strong>Amenities:</strong> {property.amenities || "N/A"}</Typography>

        <Box sx={{ mt: 2 }}>
          <Typography sx={{ fontWeight: 700, mb: 1 }}>Sentiment</Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
            <Chip label={`Water: ${property.water_sentiment || "N/A"}`} />
            <Chip label={`Electricity: ${property.electricity_sentiment || "N/A"}`} />
            <Chip label={`Gas: ${property.gas_sentiment || "N/A"}`} />
            <Chip label={`Traffic: ${property.traffic_sentiment || "N/A"}`} />
            <Chip label={`Safety: ${property.safety_sentiment || "N/A"}`} />
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
