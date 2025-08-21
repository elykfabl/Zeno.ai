document.getElementById("clickMe").addEventListener("click", () => {
    const fname = document.getElementById("fname").value;
    const lname = document.getElementById("lname").value;
    alert(`Hi ${fname} ${lname}!`);
    
});