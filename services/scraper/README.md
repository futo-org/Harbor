# Polycentric Scraper Service

This project serves as a queryable service enabling Polycentric servers to utilize the Metascraper library to scrape relevant metadata from hyperlinks. 

## SSRF Protection

This service queries user submitted URLs, and thus care must be taken to avoid introducing Server Side Request Forgery (SSRF) vulnerabilities. To protect against this, the scraper service container should be kept on its own, isolated network. The service also includes an nftables ruleset updated via the Team Cymru aggregated IPv4 bogon list to provide defense in depth.