const avg = (a, b, c) => {
    let res = (a + b + c) / 3
    console.log("Điểm trung bình: " + res)
}

const rectanglePerimeter = (width, height) => {
    let p = (width + height) * 2
    console.log("Chu vi HCN: " + p)
}

const rectangleArea = (width, height) => {
    let s = width * height
    console.log("Diện tích HCN: " + s)
}

const fahrenheitConverter = (degree) => {
    let f = (degree * 9 / 5) + 32
    console.log(degree + "°C = " + f + "°F")
}

const tipCalculator = (billAmount, tipPercent) => {
    let tipAmount = billAmount * tipPercent / 100
    let totalBill = billAmount + tipAmount
    console.log("Tổng bill: " + billAmount + " + " + tipAmount + " = " + totalBill)
}

const oddEven = (a) => {
    a % 2 === 0 ? console.log("Số " + a + " là chẵn") : console.log("Số " + a + " là lẻ");
}

const BMICalculator = (weight, height) => {
    console.log("Chỉ số BMI: " + weight / Math.pow(height/100, 2));
}