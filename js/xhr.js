const btnLoad = document.getElementById("btnLoad");
const results = document.getElementById("results");

function xhrGet(url, callback) {
  const xhr = new XMLHttpRequest();
  xhr.open("GET", url);
  xhr.onload = function () {
    if (xhr.status === 200) {
      callback(JSON.parse(xhr.responseText));
    } else {
      callback(null, `Lỗi ${xhr.status}: ${url}`);
    }
  };
  xhr.onerror = function () {
    callback(null, `Không thể tải dữ liệu: ${url}`);
  };
  xhr.send();
}

btnLoad.addEventListener("click", function () {
  results.innerHTML = "";

  xhrGet("https://api.agify.io?name=Thinh", function (data, error) {
    const message = error || `Thinh: Tuổi ${data.age ?? "không xác định"}`;
    const item = document.createElement("p");
    item.textContent = message;
    results.appendChild(item);
  });

  xhrGet("https://api.agify.io?name=Thịnh", function (data, error) {
    const message = error || `Thịnh: Tuổi ${data.age ?? "không xác định"}`;
    results.innerHTML += `<p>${message}</p>`;
  });

  xhrGet("https://api.agify.io?name=abcd", function (data, error) {
    const message = error || `abcd: Tuổi ${data.age ?? "không xác định"}`;
    const item = document.createElement("p");
    item.textContent = message;
    results.append(item);
  });
});
