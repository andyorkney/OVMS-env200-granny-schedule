#!/bin/bash
echo "Testing with Duktape..."
duk "$1"
if [ $? -eq 0 ]; then
    echo "✓ Duktape compatible"
else
    echo "✗ Duktape errors found"
    exit 1
fi