-- Migration: Add description column to competencies table
-- Run this in your Supabase SQL editor

ALTER TABLE competencies
  ADD COLUMN IF NOT EXISTS description TEXT;
