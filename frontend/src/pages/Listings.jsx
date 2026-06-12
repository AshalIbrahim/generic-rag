import React, { useEffect, useState } from 'react'
import Grid from '@mui/material/Grid'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import CardActionArea from '@mui/material/CardActionArea'
import { Link as RouterLink } from 'react-router-dom'
import Filters from '../components/Filters'

const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

export default function Listings({ filterLocation }){
  const [listings, setListings] = useState([])
  const [limit] = useState(20)
  const [locations, setLocations] = useState([])
  const [selectedLocation, setSelectedLocation] = useState(filterLocation || '')
  const [filters, setFilters] = useState({
    type: '',
    location: '',
    purpose: '',
    minPrice: '',
    maxPrice: ''
  })
  const [loading, setLoading] = useState(false)

  useEffect(()=>{
    fetchLocations()
  },[])

  useEffect(()=>{
    fetchListings()
  },[limit, selectedLocation])

  useEffect(()=>{
    if(filterLocation){
      setSelectedLocation(filterLocation)
    }
  },[filterLocation])

  async function fetchListings(){
    try{
      setLoading(true)
      const url = new URL(API + '/listings')
      url.searchParams.set('limit', limit)

      // Use selected location from Locations page if set
      if(selectedLocation){
        url.searchParams.set('location', selectedLocation)
      }

      // Apply filter values to backend query
      if(filters.location){
        url.searchParams.set('location', filters.location)
      }
      if(filters.type){
        url.searchParams.set('prop_type', filters.type)
      }
      if(filters.purpose){
        url.searchParams.set('purpose', filters.purpose)
      }
      if(filters.minPrice){
        url.searchParams.set('min_price', filters.minPrice)
      }
      if(filters.maxPrice){
        url.searchParams.set('max_price', filters.maxPrice)
      }

      const resp = await fetch(url.toString())
      const data = await resp.json()
      setListings(data || [])
    }catch(err){
      console.error('fetchListings', err)
    }finally{
      setLoading(false)
    }
  }

  async function fetchLocations(){
    try{
      const resp = await fetch(API + '/locations')
      const data = await resp.json()
      setLocations(data.locations || [])
    }catch(err){
      console.error('fetchLocations', err)
    }
  }

  function handleApplyFilters(){
    fetchListings()
  }

  function formatPrice(p){
    if(p===undefined || p===null) return 'N/A'
    const num = Number(p)
    if(Number.isNaN(num)) return p
    return num.toLocaleString(undefined, { style: 'currency', currency: 'PKR', maximumFractionDigits:0 })
  }

  return (
    <div>
      <Filters
        filters={filters}
        setFilters={setFilters}
        onApply={handleApplyFilters}
        locations={locations}
      />
      <Grid container spacing={3}>
        {loading && listings.length === 0 && (
          <>
            {[...Array(6)].map((_, i) => (
              <Grid item xs={12} md={6} lg={4} key={`skeleton-${i}`}>
                <Card className="property-card skeleton-card" />
              </Grid>
            ))}
          </>
        )}
        {listings.map((l, i) => (
          <Grid item xs={12} md={6} lg={4} key={i}>
            <Card className="property-card" sx={{ borderRadius: 3, boxShadow: 3, overflow: 'hidden', background: 'linear-gradient(135deg, rgba(20,184,166,0.08), rgba(245,158,11,0.06))' }}>
              <CardActionArea component={RouterLink} to={`/property/${l.id}`}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent:'space-between', alignItems:'center', mb:1 }}>
                  <Typography variant="h6" sx={{ fontWeight:700 }}>
                    {l.prop_type}
                    <Typography component="span" sx={{ ml:1, fontSize:12, color:'gray' }}>
                      {l.purpose}
                    </Typography>
                  </Typography>
                  <Chip 
                    label={l.location} 
                    size="small" 
                    variant="outlined"
                    sx={{
                      borderColor: '#14b8a6',
                      color: '#0f766e',
                      fontWeight: 600,
                    }}
                  />
                </Box>
                <Typography variant="subtitle1" sx={{ color: '#0f766e' , fontWeight:700 }}>
                  {formatPrice(l.price)}
                </Typography>
                <Typography variant="body2" sx={{ mt:1, color:'rgba(0,0,0,0.7)' }}>
                  {l.covered_area || 'Area N/A'}
                </Typography>
                <Typography variant="body2" sx={{ mt:0.5, color:'rgba(0,0,0,0.7)'}}>
                  Beds: {l.beds || '-'} &nbsp;|&nbsp; Baths: {l.baths || '-'}
                </Typography>
              </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>
    </div>
  )
}
