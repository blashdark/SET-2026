const sizeButtons = document.querySelectorAll(".size");
const toppingButtons = document.querySelectorAll('.topping');

sizeButtons.forEach((button) => {
  button.addEventListener("click", function () {
    const selectedButton = document.querySelector(".size.selected");

    if (selectedButton && selectedButton !== this) {
      selectedButton.classList.remove("selected");
    }

    this.classList.add("selected");
  })
})

toppingButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    btn.classList.toggle('selected');
  });
});
