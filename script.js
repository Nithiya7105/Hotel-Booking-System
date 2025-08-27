const API_URL = "https://script.google.com/macros/s/AKfycbynzQNduEudP6m9YzJ_hfncm2Pwj_D61a2ZVRPq7V-_EmLTe5Vl5v5_J0sq5QBVse4t2w/exec"; // <-- your Web App URL

async function fetchData(action, params = {}) {
  const url = new URL(API_URL);
  url.searchParams.append("action", action);
  for (const key in params) {
    url.searchParams.append(key, params[key]);
  }
  const res = await fetch(url.toString());
  return res.json();
}

function showToast(message, isError = false) {
  const toast = document.getElementById("toast");
  toast.innerText = message;
  toast.style.backgroundColor = isError ? "var(--danger)" : "var(--brand)";
  toast.style.display = "block";
  setTimeout(() => {
    toast.style.display = "none";
  }, 3000);
}

document.addEventListener("DOMContentLoaded", () => {
  const checkInInput = document.getElementById("checkIn");
  const checkOutInput = document.getElementById("checkOut");
  const adultsInput = document.getElementById("adults");
  const childrenInput = document.getElementById("children");
  const rateFilterSelect = document.getElementById("rateFilter");
  const searchBtn = document.getElementById("searchBtn");
  const resultsDiv = document.getElementById("results");
  const bookingPanel = document.getElementById("bookingPanel");
  const guestNameInput = document.getElementById("guestName");
  const guestEmailInput = document.getElementById("guestEmail");
  const selectedSummaryDiv = document.getElementById("selectedSummary");
  const selectedTotalDiv = document.getElementById("selectedTotal");
  const cancelBookingBtn = document.getElementById("cancelBooking");
  const confirmBookingBtn = document.getElementById("confirmBooking");

  // Booking Confirmation Modal elements
  const bookingConfirmationModal = document.getElementById("bookingConfirmationModal");
  const modalBookingId = document.getElementById("modalBookingId");
  const modalGuestName = document.getElementById("modalGuestName");
  const modalGuestEmail = document.getElementById("modalGuestEmail");
  const modalCheckInDate = document.getElementById("modalCheckInDate");
  const modalCheckOutDate = document.getElementById("modalCheckOutDate");
  const modalRoomType = document.getElementById("modalRoomType");
  const modalRatePlan = document.getElementById("modalRatePlan");
  const modalTotalPrice = document.getElementById("modalTotalPrice");
  const closeConfirmationModalBtn = document.getElementById("closeConfirmationModal");
  const printConfirmationBtn = document.getElementById("printConfirmation");

  let allRoomTypes = [];
  let allRatePlans = [];
  let selectedRoom = null;
  let selectedRatePlan = null;
  let currentPricing = [];

  // Set default dates
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  checkInInput.valueAsDate = today;
  checkOutInput.valueAsDate = tomorrow;

  // Populate dropdowns and initial data
  async function loadInitialData() {
    try {
      allRoomTypes = await fetchData("room-types");
      allRatePlans = await fetchData("rate-plans");

      rateFilterSelect.innerHTML = '<option value="ALL" selected>All</option>';
      allRatePlans.forEach(rp => {
        rateFilterSelect.innerHTML += `<option value="${rp.RatePlanID}">${rp.PlanName}</option>`;
      });
      await searchAvailability();
    } catch (error) {
      showToast("Error loading initial data.", true);
      console.error("Error loading initial data:", error);
    }
  }

  // Search availability
  async function searchAvailability() {
    const checkInDate = checkInInput.value;
    const checkOutDate = checkOutInput.value;
    const adults = adultsInput.value;
    const children = childrenInput.value;
    const rateFilter = rateFilterSelect.value;

    if (!checkInDate || !checkOutDate) {
      showToast("Please select both check-in and check-out dates.", true);
      return;
    }
    if (new Date(checkInDate) >= new Date(checkOutDate)) {
      showToast("Check-out date must be after check-in date.", true);
      return;
    }

    try {
      showToast("Searching for availability...");
      const availableRooms = await fetchData("availability", {
        checkIn: checkInDate,
        checkOut: checkOutDate,
        adults: adults,
        children: children,
        ratePlan: rateFilter
      });

      currentPricing = await fetchData("pricing");

      displayResults(availableRooms);
    } catch (error) {
      showToast("Error searching for availability.", true);
      console.error("Error searching availability:", error);
    }
  }

  function calculatePrice(roomTypeId, ratePlanId, nights, adults, children) {
    const roomType = allRoomTypes.find(rt => rt.RoomTypeID == roomTypeId);
    const ratePlan = allRatePlans.find(rp => rp.RatePlanID == ratePlanId);

    if (!roomType || !ratePlan) return 0;

    const pricingMatch = currentPricing.find(
      p => p.RoomTypeID == roomTypeId && p.RatePlanID == ratePlanId
    );

    if (!pricingMatch) return 0;

    let total = nights * (pricingMatch.BasePrice +
      (adults - 1) * pricingMatch.ExtraAdultPrice +
      children * pricingMatch.ExtraChildPrice);

    return total;
  }

  function displayResults(availableRooms) {
    resultsDiv.innerHTML = "";
    if (availableRooms.length === 0) {
      resultsDiv.innerHTML = '<div class="card" style="padding: 20px; text-align: center; color: var(--muted);">No rooms available for the selected dates and criteria.</div>';
      return;
    }

    const checkInDate = new Date(checkInInput.value);
    const checkOutDate = new Date(checkOutInput.value);
    const nights = (checkOutDate - checkInDate) / (1000 * 60 * 60 * 24);
    const adults = parseInt(adultsInput.value);
    const children = parseInt(childrenInput.value);

    const roomTypeMap = new Map(allRoomTypes.map(rt => [rt.RoomTypeID, rt]));
    const ratePlanMap = new Map(allRatePlans.map(rp => [rp.RatePlanID, rp]));

    const groupedRooms = availableRooms.reduce((acc, room) => {
      if (!acc[room.RoomTypeID]) {
        acc[room.RoomTypeID] = {
          roomType: roomTypeMap.get(room.RoomTypeID),
          availableRatePlans: []
        };
      }
      acc[room.RoomTypeID].availableRatePlans.push(room);
      return acc;
    }, {});

    for (const roomTypeId in groupedRooms) {
      const roomGroup = groupedRooms[roomTypeId];
      const roomType = roomGroup.roomType;

      let roomHtml = `
        <div class="card">
          <table class="room-table">
            <thead>
              <tr>
                <th colspan="3">${roomType.RoomName}</th>
              </tr>
              <tr>
                <th>Rate Plan</th>
                <th>Price</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
      `;

      roomGroup.availableRatePlans.forEach(room => {
        const ratePlan = ratePlanMap.get(room.RatePlanID);
        const price = calculatePrice(room.RoomTypeID, room.RatePlanID, nights, adults, children);
        roomHtml += `
          <tr>
            <td>${ratePlan.PlanName}</td>
            <td>₹${price.toFixed(2)}</td>
            <td>
              <button class="btn btn-primary btn-sm" data-room-type-id="${room.RoomTypeID}" data-rate-plan-id="${room.RatePlanID}" data-price="${price}">Select</button>
            </td>
          </tr>
        `;
      });

      roomHtml += `
            </tbody>
          </table>
        </div>
      `;
      resultsDiv.innerHTML += roomHtml;
    }

    // Add event listeners for select buttons
    resultsDiv.querySelectorAll(".btn-sm").forEach(button => {
      button.addEventListener("click", (e) => {
        const roomTypeId = e.target.dataset.roomTypeId;
        const ratePlanId = e.target.dataset.ratePlanId;
        const price = parseFloat(e.target.dataset.price);

        selectedRoom = allRoomTypes.find(rt => rt.RoomTypeID == roomTypeId);
        selectedRatePlan = allRatePlans.find(rp => rp.RatePlanID == ratePlanId);

        selectedSummaryDiv.innerText = `${selectedRoom.RoomName} with ${selectedRatePlan.PlanName} (${nights} nights)`;
        selectedTotalDiv.innerText = `₹${price.toFixed(2)}`;
        bookingPanel.style.display = "block";
      });
    });
  }

  // Handle booking confirmation
  confirmBookingBtn.addEventListener("click", async () => {
    const checkInDate = checkInInput.value;
    const checkOutDate = checkOutInput.value;
    const adults = adultsInput.value;
    const children = childrenInput.value;
    const guestName = guestNameInput.value;
    const guestEmail = guestEmailInput.value;

    if (!guestName || !guestEmail) {
      showToast("Please enter guest name and email.", true);
      return;
    }

    if (!selectedRoom || !selectedRatePlan) {
      showToast("Please select a room and rate plan.", true);
      return;
    }

    try {
      showToast("Confirming booking...");
      const bookingData = {
        checkInDate,
        checkOutDate,
        adults,
        children,
        roomTypeId: selectedRoom.RoomTypeID,
        ratePlanId: selectedRatePlan.RatePlanID,
        guestName,
        guestEmail,
        totalPrice: parseFloat(selectedTotalDiv.innerText.replace('₹', ''))
      };

      const res = await fetch(`${API_URL}?action=book-room`, {
        method: "POST",
        body: JSON.stringify(bookingData),
      });

      const result = await res.json();

      if (result.success) {
        // Populate and show the confirmation modal
        modalBookingId.innerText = result.bookingId;
        modalGuestName.innerText = bookingData.guestName;
        modalGuestEmail.innerText = bookingData.guestEmail;
        modalCheckInDate.innerText = bookingData.checkInDate;
        modalCheckOutDate.innerText = bookingData.checkOutDate;
        modalRoomType.innerText = selectedRoom.RoomName;
        modalRatePlan.innerText = selectedRatePlan.PlanName;
        modalTotalPrice.innerText = `₹${bookingData.totalPrice.toFixed(2)}`;

        bookingConfirmationModal.classList.add("show");
        bookingPanel.style.display = "none";
        guestNameInput.value = "";
        guestEmailInput.value = "";
        selectedRoom = null;
        selectedRatePlan = null;
        searchAvailability(); // Refresh availability
      } else {
        showToast("Error: " + result.error, true);
      }
    } catch (error) {
      showToast("Error during booking.", true);
      console.error("Error during booking:", error);
    }
  });

  // Close booking confirmation modal
  closeConfirmationModalBtn.addEventListener("click", () => {
    bookingConfirmationModal.classList.remove("show");
  });

  // Print booking confirmation
  printConfirmationBtn.addEventListener("click", () => {
    const printContent = document.querySelector("#bookingConfirmationModal .modal-content").innerHTML;
    const originalBody = document.body.innerHTML;
    document.body.innerHTML = printContent;
    window.print();
    document.body.innerHTML = originalBody;
    // Re-attach event listeners if necessary, or simply reload the page
    location.reload();
  });

  // Cancel booking
  cancelBookingBtn.addEventListener("click", () => {
    bookingPanel.style.display = "none";
    selectedRoom = null;
    selectedRatePlan = null;
  });

  // Event listeners for search criteria changes
  [checkInInput, checkOutInput, adultsInput, childrenInput, rateFilterSelect].forEach(element => {
    element.addEventListener("change", searchAvailability);
  });
  searchBtn.addEventListener("click", searchAvailability);

  // Init
  loadInitialData();
});
