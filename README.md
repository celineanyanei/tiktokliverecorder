---
title: TikTok Live Recorder
emoji: 🎥
colorFrom: blue
colorTo: green
sdk: docker
app_port: 7860
---

# TikTok Live Recorder

A web-based tool to easily download TikTok live streams in real-time, designed to work smoothly in cloud environments (like Hugging Face Spaces) and locally via Docker.

## Setup

This application is fully containerized. To run it, simply deploy the included `Dockerfile` or use `docker-compose`.

## Features
- Real-time stream processing via FFmpeg.
- Handles standard `.mp4` and `.mkv` formats.
- Fully responsive Web UI with live streaming preview capabilities.
- Cloud-optimized: Can run efficiently on Hugging Face Spaces Docker SDK.
