module.exports = {
  apps: [{
    name: "minicli-daemon",
    script: "bin/mini.cjs",
    args: "daemon",
    restart_delay: 5000,
    max_restarts: 10,
    env: {
      NODE_ENV: "production"
    }
  }]
}
