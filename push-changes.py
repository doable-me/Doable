#!/usr/bin/env python3
import subprocess
import os

os.chdir(r"C:\Users\gj\Documents\workspace\doable")

# Stage all changes
subprocess.run(["git", "add", "-A"], check=True)

# Commit
subprocess.run(["git", "commit", "-m", 
  "Add error handling and dev server recovery scripts"], check=True)

# Push
subprocess.run(["git", "push", "origin", "main"], check=True)

print("✓ Changes pushed successfully")
