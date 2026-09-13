import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Typography,
  Button,
  TextField,
  Alert,
  IconButton,
  Dialog,
} from "@mui/material";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

export default function PropertyDetails() {
  const { id } = useParams();
  const [property, setProperty] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // ---- Edit mode state ----
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // ---- Image gallery state ----
  const [newImages, setNewImages] = useState([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [imageError, setImageError] = useState("");
  const [deletingImageId, setDeletingImageId] = useState(null);
  const [lightboxUrl, setLightboxUrl] = useState(null);

  useEffect(() => {
    fetchProperty();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

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

  const formatPrice = (p) => {
    const num = Number(p);
    if (Number.isNaN(num)) return p || "N/A";
    return num.toLocaleString(undefined, {
      style: "currency",
      currency: "PKR",
      maximumFractionDigits: 0,
    });
  };

  // ---- Edit mode handlers ----
  const startEdit = () => {
    setEditForm({
      prop_type: property.prop_type === "N/A" ? "" : property.prop_type,
      purpose: property.purpose === "N/A" ? "" : property.purpose,
      covered_area: property.covered_area ?? "",
      price: property.price ?? "",
      location: property.location === "N/A" ? "" : property.location,
      beds: property.beds ?? "",
      baths: property.baths ?? "",
      amenities: property.amenities === "N/A" ? "" : property.amenities,
    });
    setSaveError("");
    setEditMode(true);
  };

  const cancelEdit = () => {
    setEditMode(false);
    setEditForm(null);
    setSaveError("");
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    setSaveError("");
    try {
      const resp = await fetch(`${API}/listings/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prop_type: editForm.prop_type,
          purpose: editForm.purpose,
          covered_area: parseFloat(editForm.covered_area),
          price: parseFloat(editForm.price),
          location: editForm.location,
          beds: parseInt(editForm.beds, 10),
          baths: parseInt(editForm.baths, 10),
          amenities: editForm.amenities || "",
        }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.detail || "Failed to save changes");
      }
      await fetchProperty();
      setEditMode(false);
      setEditForm(null);
    } catch (e) {
      setSaveError(e.message || "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  // ---- Image gallery handlers ----
  const handleNewImagesChange = (e) => {
    setNewImages(Array.from(e.target.files || []));
    setImageError("");
  };

  const handleUploadImages = async () => {
    if (newImages.length === 0) return;
    setUploadingImages(true);
    setImageError("");
    const payload = new FormData();
    newImages.forEach((file) => payload.append("files", file));

    try {
      const resp = await fetch(`${API}/listings/${id}/images`, {
        method: "POST",
        body: payload,
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.detail || "Failed to upload images");
      }
      const data = await resp.json();
      if (data.failed && data.failed.length > 0) {
        setImageError(`${data.failed.length} image(s) failed to upload.`);
      }
      setNewImages([]);
      await fetchProperty();
    } catch (e) {
      setImageError(e.message || "Failed to upload images");
    } finally {
      setUploadingImages(false);
    }
  };

  const handleDeleteImage = async (imageId) => {
    setDeletingImageId(imageId);
    setImageError("");
    try {
      const resp = await fetch(`${API}/listings/${id}/images/${imageId}`, {
        method: "DELETE",
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.detail || "Failed to delete image");
      }
      await fetchProperty();
    } catch (e) {
      setImageError(e.message || "Failed to delete image");
    } finally {
      setDeletingImageId(null);
    }
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
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Property #{property.id}
          </Typography>
          {!editMode && (
            <Button variant="outlined" onClick={startEdit}>
              Edit
            </Button>
          )}
        </Box>

        {saveError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {saveError}
          </Alert>
        )}

        {!editMode ? (
          <>
            <Typography sx={{ mb: 1 }}><strong>Price:</strong> {formatPrice(property.price)}</Typography>
            <Typography sx={{ mb: 1 }}><strong>Type:</strong> {property.prop_type || "N/A"}</Typography>
            <Typography sx={{ mb: 1 }}><strong>Purpose:</strong> {property.purpose || "N/A"}</Typography>
            <Typography sx={{ mb: 1 }}><strong>Location:</strong> {property.location || "N/A"}</Typography>
            <Typography sx={{ mb: 1 }}><strong>Covered Area:</strong> {property.covered_area ?? "N/A"}</Typography>
            <Typography sx={{ mb: 1 }}><strong>Beds:</strong> {property.beds ?? "N/A"}</Typography>
            <Typography sx={{ mb: 1 }}><strong>Baths:</strong> {property.baths ?? "N/A"}</Typography>
            <Typography sx={{ mb: 1 }}><strong>Amenities:</strong> {property.amenities || "N/A"}</Typography>
          </>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mb: 2 }}>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
              <TextField label="Property Type" name="prop_type" value={editForm.prop_type} onChange={handleEditChange} fullWidth />
              <TextField label="Purpose" name="purpose" value={editForm.purpose} onChange={handleEditChange} fullWidth />
              <TextField label="Location" name="location" value={editForm.location} onChange={handleEditChange} fullWidth />
              <TextField label="Price (PKR)" name="price" type="number" value={editForm.price} onChange={handleEditChange} fullWidth />
              <TextField label="Covered Area" name="covered_area" type="number" value={editForm.covered_area} onChange={handleEditChange} fullWidth />
              <TextField label="Beds" name="beds" type="number" value={editForm.beds} onChange={handleEditChange} fullWidth />
              <TextField label="Baths" name="baths" type="number" value={editForm.baths} onChange={handleEditChange} fullWidth />
            </Box>
            <TextField
              label="Amenities"
              name="amenities"
              value={editForm.amenities}
              onChange={handleEditChange}
              fullWidth
              multiline
              rows={3}
            />
            <Box sx={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
              <Button variant="outlined" onClick={cancelEdit} disabled={saving}>
                Cancel
              </Button>
              <Button variant="contained" onClick={handleSaveEdit} disabled={saving}>
                {saving ? <CircularProgress size={22} color="inherit" /> : "Save Changes"}
              </Button>
            </Box>
          </Box>
        )}

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

        <Box sx={{ mt: 3 }}>
          <Typography sx={{ fontWeight: 700, mb: 1 }}>Images</Typography>

          {imageError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {imageError}
            </Alert>
          )}

          {property.images && property.images.length > 0 ? (
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mb: 2 }}>
              {property.images.map((img) => (
                <Box key={img.id} sx={{ position: "relative", width: 140, height: 140 }}>
                  <Box
                    component="img"
                    src={img.url}
                    alt={`Property ${property.id}`}
                    onClick={() => setLightboxUrl(img.url)}
                    sx={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      borderRadius: 2,
                      cursor: "zoom-in",
                    }}
                  />
                  <IconButton
                    size="small"
                    onClick={() => handleDeleteImage(img.id)}
                    disabled={deletingImageId === img.id}
                    sx={{
                      position: "absolute",
                      top: 4,
                      right: 4,
                      background: "rgba(0,0,0,0.6)",
                      color: "#fff",
                      "&:hover": { background: "rgba(0,0,0,0.8)" },
                    }}
                  >
                    {deletingImageId === img.id ? (
                      <CircularProgress size={16} color="inherit" />
                    ) : (
                      <Typography sx={{ fontSize: 14, lineHeight: 1, px: 0.5 }}>×</Typography>
                    )}
                  </IconButton>
                </Box>
              ))}
            </Box>
          ) : (
            <Typography sx={{ color: "text.secondary", mb: 2 }}>No images uploaded yet.</Typography>
          )}

          <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
            <Button variant="outlined" component="label">
              {newImages.length > 0 ? `${newImages.length} image(s) selected` : "Choose Images"}
              <input type="file" hidden multiple accept="image/*" onChange={handleNewImagesChange} />
            </Button>
            <Button
              variant="contained"
              onClick={handleUploadImages}
              disabled={newImages.length === 0 || uploadingImages}
            >
              {uploadingImages ? <CircularProgress size={20} color="inherit" /> : "Upload"}
            </Button>
          </Box>
        </Box>
      </CardContent>

      <Dialog open={Boolean(lightboxUrl)} onClose={() => setLightboxUrl(null)} maxWidth="lg">
        {lightboxUrl && (
          <Box
            component="img"
            src={lightboxUrl}
            alt="Property"
            onClick={() => setLightboxUrl(null)}
            sx={{
              width: "100%",
              maxHeight: "85vh",
              objectFit: "contain",
              display: "block",
              cursor: "zoom-out",
            }}
          />
        )}
      </Dialog>
    </Card>
  );
}