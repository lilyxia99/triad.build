#!/bin/bash

# Check if usernames are provided
if [ $# -eq 0 ]; then
    echo "Usage: $0 username1 [username2] [username3] ..."
    exit 1
fi

# Load environment variables from .env file if it exists
if [ -f .env ]; then
    echo "Loading .env file..."
    # Only export lines that don't start with # and contain =
    export $(grep -v '^#' .env | grep '=' | grep -v '//' | xargs)
else
    echo "No .env file found in current directory"
fi

# Get the list of usernames from command-line arguments
usernames=("$@")

# Define the access token
access_token=$INSTAGRAM_USER_ACCESS_TOKEN

# Debug environment variables
echo "DEBUG: All environment variables containing 'INSTAGRAM':"
env | grep INSTAGRAM || echo "No INSTAGRAM variables found"

echo "DEBUG: access_token variable value: '$access_token'"
echo "DEBUG: Direct check of INSTAGRAM_USER_ACCESS_TOKEN: '$INSTAGRAM_USER_ACCESS_TOKEN'"

# Check if access token is set
if [ -z "$access_token" ]; then
    echo "Error: INSTAGRAM_USER_ACCESS_TOKEN environment variable is not set"
    echo "Please set it with: export INSTAGRAM_USER_ACCESS_TOKEN='your_token_here'"
    exit 1
fi

echo "Using access token: ${access_token:0:10}..." # Show first 10 chars for debugging

# Loop through each username and fetch the data
for username in "${usernames[@]}"
do
  echo "Fetching data for username: ${username}"
  
  # URL encode the fields parameter to handle nested braces
  fields="business_discovery.username(${username}){media.limit(5){caption,permalink,timestamp,media_type,media_url,children{media_url}}}"
  encoded_fields=$(printf '%s' "$fields" | jq -sRr @uri)
  
  url="https://graph.facebook.com/v23.0/2564187097283752?fields=${encoded_fields}&access_token=${access_token}"
  
  echo "Request URL: $url"
  
  response=$(curl -sS "$url")
  
  echo "Raw response: $response"

  # Check if jq is available
  if ! command -v jq &> /dev/null; then
      echo "Error: jq is not installed. Please install jq to parse JSON responses."
      exit 1
  fi

  # Check if the request was successful
  if echo "$response" | jq -e '.error' > /dev/null 2>&1; then
    error_msg=$(echo "$response" | jq -r '.error.message // .error.error_user_msg // "Unknown error"')
    error_code=$(echo "$response" | jq -r '.error.code // "Unknown code"')
    echo "Error fetching data for username: ${username}"
    echo "Error code: $error_code"
    echo "Error message: $error_msg"
  else
    echo "Data fetched successfully for username: ${username}"
    # Show basic info about the response
    media_count=$(echo "$response" | jq -r '.business_discovery.media.data | length // 0')
    echo "Found $media_count media items"
    
    # Show the actual content being fetched
    echo "Content preview:"
    echo "$response" | jq -r '.business_discovery.media.data[]? | "- \(.caption // "No caption") (\(.timestamp))"' | head -5
    
    # Show full JSON response for debugging (optional)
    echo "Full response JSON:"
    echo "$response" | jq '.'
  fi
  
  echo "---"
done

