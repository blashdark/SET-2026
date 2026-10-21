function logRequest(req, res) {
  console.log(req.method, req.url);
  return true;
}

module.exports = logRequest;
