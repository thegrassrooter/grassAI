import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import Login from "./Login";

const BACKEND_URL =
  "https://script.google.com/macros/s/AKfycbxpJ7bm8l-WmKg0oBX2DVgR8kU8DxlwtooJbBxpINkf3mqiEv0mQbySJcz5jWhc1SYpDw/exec";

const MAX_ATTACHMENTS = 3;
const MAX_IMAGE_SIZE = 4 * 1024 * 1024;

const SUBSCRIPTION_PLANS = [
  {
    id: "default",
    name: "Default",
    model: "grass1",
    price: "$0",
    description: "The standard grassAI experience.",
    features: [
      "grass1",
      "Standard AI access",
      "Chat history",
    ],
  },
  {
    id: "premium",
    name: "Premium",
    model: "grass2",
    price: "$6.99",
    description: "Advanced AI with coding capabilities.",
    features: [
      "grass1",
      "grass2",
      "Coding with grass2",
      "Everything in Default",
    ],
  },
];

const MODEL_ACCESS = {
  default: ["grass1"],
  premium: ["grass1", "grass2"],
};

const MODEL_INFO = {
  grass1: {
    name: "grass1",
    icon: "🌱",
    badge: "Free",
    description: "Standard AI",
    detail:
      "General AI for schoolwork, explanations, writing and everyday questions.",
  },
  grass2: {
    name: "grass2",
    icon: "⚡",
    badge: "Premium",
    description: "Coding + advanced AI",
    detail:
      "More capable reasoning with full coding support.",
  },
};

function createLocalConversation() {
  return {
    id: `conversation-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`,
    title: "New chat",
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function createTitle(text) {
  let title = text.replace(/\s+/g, " ").trim();

  if (title.length > 34) {
    title = title.slice(0, 34).trim() + "…";
  }

  return title || "New chat";
}

function getSubscriptionStorageKey(userId) {
  return `grassAI_subscription_${userId}`;
}

function getThemeStorageKey(userId) {
  return `grassAI_theme_${userId}`;
}

function getDefaultSubscription() {
  return {
    tier: "default",
    unlockedModels: ["grass1"],
    selectedModel: "grass1",
  };
}

function normalizeSubscription(saved) {
  const fallback = getDefaultSubscription();

  if (!saved || typeof saved !== "object") {
    return fallback;
  }

  let tier = saved.tier;

  if (
    tier === "pro" ||
    tier === "procode" ||
    tier === "premium"
  ) {
    tier = "premium";
  } else {
    tier = "default";
  }

  const allowedModels =
    MODEL_ACCESS[tier] || fallback.unlockedModels;

  const selectedModel = allowedModels.includes(
    saved.selectedModel
  )
    ? saved.selectedModel
    : allowedModels[allowedModels.length - 1];

  return {
    tier,
    unlockedModels: allowedModels,
    selectedModel,
  };
}

function subscriptionFromServer(value, previous) {
  const tier =
    value === "premium" ? "premium" : "default";

  const allowedModels =
    MODEL_ACCESS[tier];

  const previousSelected =
    previous?.selectedModel;

  const selectedModel =
    allowedModels.includes(previousSelected)
      ? previousSelected
      : allowedModels[allowedModels.length - 1];

  return {
    tier,
    unlockedModels: allowedModels,
    selectedModel,
  };
}

function App() {
  const [user, setUser] = useState(null);
  const [credential, setCredential] = useState(null);

  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] =
    useState(null);

  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [isLoadingChat, setIsLoadingChat] = useState(false);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [subscriptionOpen, setSubscriptionOpen] =
    useState(false);

  const [subscription, setSubscription] =
    useState(getDefaultSubscription());

  const [promoCode, setPromoCode] = useState("");
  const [promoMessage, setPromoMessage] = useState("");

  const [checkoutPlanId, setCheckoutPlanId] = useState(null);

  const [cardName, setCardName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvc, setCardCvc] = useState("");
  const [paymentError, setPaymentError] = useState("");

  const [theme, setTheme] = useState("light");

  const [attachments, setAttachments] = useState([]);
  const [attachmentError, setAttachmentError] =
    useState("");

  const fileInputRef = useRef(null);

  const [renameDialog, setRenameDialog] = useState({
    open: false,
    conversationId: null,
    value: "",
  });

  const [deleteDialog, setDeleteDialog] = useState({
    open: false,
    conversationId: null,
    title: "",
  });

  const [adminUsers, setAdminUsers] = useState([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState("");
  const [adminMessage, setAdminMessage] = useState("");

  const subscriptionLoadedRef = useRef(false);
  const subscriptionSyncRef = useRef(false);

  /*
   * =========================
   * BACKEND HELPERS
   * =========================
   */

  async function postBackend(action, values = {}) {
    const formData = new URLSearchParams();

    formData.append("action", action);

    Object.entries(values).forEach(
      ([key, value]) => {
        if (value !== undefined && value !== null) {
          formData.append(
            key,
            typeof value === "string"
              ? value
              : JSON.stringify(value)
          );
        }
      }
    );

    const response = await fetch(
      BACKEND_URL,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: formData.toString(),
      }
    );

    const rawResponse = await response.text();

    if (!response.ok) {
      throw new Error(
        `Backend HTTP ${response.status}`
      );
    }

    let data;

    try {
      data = JSON.parse(rawResponse);
    } catch {
      throw new Error(
        "The backend returned an invalid response."
      );
    }

    if (!data.success) {
      throw new Error(
        data.error ||
          "The backend could not complete the request."
      );
    }

    return data;
  }

  /*
   * =========================
   * THEME
   * =========================
   */

  useEffect(() => {
    if (!user?.id) {
      document.documentElement.dataset.theme =
        "light";
      return;
    }

    const storageKey =
      getThemeStorageKey(user.id);

    const savedTheme =
      localStorage.getItem(storageKey);

    const nextTheme =
      savedTheme === "dark"
        ? "dark"
        : "light";

    setTheme(nextTheme);

    document.documentElement.dataset.theme =
      nextTheme;
  }, [user]);

  useEffect(() => {
    document.documentElement.dataset.theme =
      theme;

    if (!user?.id) {
      return;
    }

    localStorage.setItem(
      getThemeStorageKey(user.id),
      theme
    );
  }, [theme, user]);

  /*
   * =========================
   * SUBSCRIPTION
   * =========================
   */

  useEffect(() => {
    if (!user?.id) {
      subscriptionLoadedRef.current = false;
      return;
    }

    subscriptionLoadedRef.current = false;

    const storageKey =
      getSubscriptionStorageKey(user.id);

    const saved =
      localStorage.getItem(storageKey);

    if (!saved) {
      setSubscription(
        getDefaultSubscription()
      );

      subscriptionLoadedRef.current = true;
      return;
    }

    try {
      const parsed = JSON.parse(saved);

      setSubscription(
        normalizeSubscription(parsed)
      );
    } catch (error) {
      console.error(
        "Could not load saved subscription:",
        error
      );

      setSubscription(
        getDefaultSubscription()
      );
    }

    subscriptionLoadedRef.current = true;
  }, [user]);

  useEffect(() => {
    if (
      !user?.id ||
      !subscriptionLoadedRef.current
    ) {
      return;
    }

    const storageKey =
      getSubscriptionStorageKey(user.id);

    localStorage.setItem(
      storageKey,
      JSON.stringify(
        normalizeSubscription(subscription)
      )
    );
  }, [subscription, user]);

  /*
   * Server subscription is the source of truth.
   *
   * This prevents localStorage from being able
   * to unlock grass2 after Premium is revoked.
   */
  async function refreshServerSubscription(
    showErrors = false
  ) {
    if (!credential || !user) {
      return null;
    }

    try {
      const data =
        await postBackend(
          "getSubscription",
          {
            credential,
          }
        );

      const serverSubscription =
        subscriptionFromServer(
          data.subscription,
          subscription
        );

      setSubscription(
        serverSubscription
      );

      if (
        serverSubscription.tier ===
        "default"
      ) {
        setAttachments([]);
        setAttachmentError("");
      }

      setUser(
        (current) =>
          current
            ? {
                ...current,
                subscription:
                  data.subscription,
                isAdmin:
                  Boolean(
                    data.isAdmin
                  ),
              }
            : current
      );

      return data;
    } catch (error) {
      console.error(
        "Could not refresh server subscription:",
        error
      );

      if (showErrors) {
        setPromoMessage(
          error.message ||
            "Could not refresh your subscription."
        );
      }

      return null;
    }
  }

  /*
   * Check the server whenever Settings opens.
   *
   * This is important when an administrator
   * revokes Premium while the user is still
   * inside an existing session.
   */
  useEffect(() => {
    if (!settingsOpen || !credential || !user) {
      return;
    }

    if (subscriptionSyncRef.current) {
      return;
    }

    subscriptionSyncRef.current = true;

    refreshServerSubscription()
      .finally(() => {
        subscriptionSyncRef.current = false;
      });
  }, [settingsOpen]);

  /*
   * =========================
   * GRASS1 / GRASS2 ATTACHMENT RULE
   * =========================
   */

  useEffect(() => {
    if (
      subscription.selectedModel !==
      "grass2"
    ) {
      setAttachments([]);
      setAttachmentError("");
    }
  }, [subscription.selectedModel]);

  /*
   * =========================
   * CONVERSATIONS
   * =========================
   */

  async function saveConversations(
    nextConversations
  ) {
    if (!credential) {
      return;
    }

    try {
      await postBackend(
        "saveConversations",
        {
          credential,
          conversations:
            JSON.stringify(
              nextConversations
            ),
        }
      );
    } catch (error) {
      console.error(
        "Could not save conversations:",
        error
      );
    }
  }

  async function handleLogin(
    loggedInUser,
    googleCredential
  ) {
    setUser(loggedInUser);
    setCredential(googleCredential);

    setConversations([]);
    setActiveConversationId(null);
    setIsLoadingChat(true);

    setSettingsOpen(false);
    setSubscriptionOpen(false);
    setCheckoutPlanId(null);

    setAttachments([]);
    setAttachmentError("");

    /*
     * The backend login response is the
     * authoritative subscription state.
     */
    if (
      loggedInUser?.subscription
    ) {
      setSubscription(
        subscriptionFromServer(
          loggedInUser.subscription,
          getDefaultSubscription()
        )
      );
    } else {
      setSubscription(
        getDefaultSubscription()
      );
    }

    try {
      const data =
        await postBackend(
          "loadConversations",
          {
            credential:
              googleCredential,
          }
        );

      let loaded =
        Array.isArray(
          data.conversations
        )
          ? data.conversations
          : [];

      if (loaded.length === 0) {
        const storageKey =
          `grassAI_chat_${loggedInUser.id}`;

        const oldLocalChat =
          localStorage.getItem(
            storageKey
          );

        if (oldLocalChat) {
          try {
            const oldMessages =
              JSON.parse(
                oldLocalChat
              );

            if (
              Array.isArray(
                oldMessages
              ) &&
              oldMessages.length > 0
            ) {
              const migrated =
                createLocalConversation();

              migrated.title =
                createTitle(
                  oldMessages.find(
                    (message) =>
                      message.sender ===
                      "user"
                  )?.text ||
                    "New chat"
                );

              migrated.messages =
                oldMessages;

              loaded = [
                migrated,
              ];

              try {
                await postBackend(
                  "saveConversations",
                  {
                    credential:
                      googleCredential,
                    conversations:
                      JSON.stringify(
                        loaded
                      ),
                  }
                );
              } catch (
                migrationError
              ) {
                console.error(
                  "Cloud migration save failed:",
                  migrationError
                );
              }
            }
          } catch (error) {
            console.error(
              "Old chat migration failed:",
              error
            );
          }
        }
      }

      setConversations(
        loaded
      );

      if (loaded.length > 0) {
        setActiveConversationId(
          loaded[0].id
        );
      }

      /*
       * Ask the backend one more time after
       * loading so the session always uses
       * the current server subscription.
       */
      try {
        const subscriptionData =
          await postBackend(
            "getSubscription",
            {
              credential:
                googleCredential,
            }
          );

        const syncedSubscription =
          subscriptionFromServer(
            subscriptionData.subscription,
            subscription
          );

        setSubscription(
          syncedSubscription
        );

        setUser(
          (current) =>
            current
              ? {
                  ...current,
                  subscription:
                    subscriptionData.subscription,
                  isAdmin:
                    Boolean(
                      subscriptionData.isAdmin
                    ),
                }
              : current
        );
      } catch (subscriptionError) {
        console.error(
          "Could not sync subscription after login:",
          subscriptionError
        );
      }
    } catch (error) {
      console.error(
        "Could not load conversations:",
        error
      );
    } finally {
      setIsLoadingChat(false);
    }
  }

  function getActiveConversation() {
    return (
      conversations.find(
        (conversation) =>
          conversation.id ===
          activeConversationId
      ) || null
    );
  }

  function createNewChat() {
    const newConversation =
      createLocalConversation();

    const nextConversations = [
      newConversation,
      ...conversations,
    ];

    setConversations(
      nextConversations
    );

    setActiveConversationId(
      newConversation.id
    );

    setInput("");
    setAttachments([]);
    setAttachmentError("");

    saveConversations(
      nextConversations
    );
  }

  function switchConversation(id) {
    if (isThinking) {
      return;
    }

    setActiveConversationId(id);
    setInput("");
    setAttachments([]);
    setAttachmentError("");
  }

  function openRenameDialog(id) {
    const conversation =
      conversations.find(
        (item) =>
          item.id === id
      );

    if (!conversation) {
      return;
    }

    setRenameDialog({
      open: true,
      conversationId: id,
      value:
        conversation.title,
    });
  }

  function closeRenameDialog() {
    setRenameDialog({
      open: false,
      conversationId: null,
      value: "",
    });
  }

  async function confirmRename() {
    const {
      conversationId,
      value,
    } = renameDialog;

    if (!conversationId) {
      return;
    }

    const trimmed =
      value.trim();

    if (!trimmed) {
      return;
    }

    const nextConversations =
      conversations.map(
        (item) =>
          item.id ===
          conversationId
            ? {
                ...item,
                title:
                  trimmed.slice(
                    0,
                    60
                  ),
                updatedAt:
                  new Date().toISOString(),
              }
            : item
      );

    setConversations(
      nextConversations
    );

    closeRenameDialog();

    await saveConversations(
      nextConversations
    );
  }

  function openDeleteDialog(id) {
    const conversation =
      conversations.find(
        (item) =>
          item.id === id
      );

    if (!conversation) {
      return;
    }

    setDeleteDialog({
      open: true,
      conversationId: id,
      title:
        conversation.title,
    });
  }

  function closeDeleteDialog() {
    setDeleteDialog({
      open: false,
      conversationId: null,
      title: "",
    });
  }

  async function confirmDelete() {
    const {
      conversationId,
    } = deleteDialog;

    if (!conversationId) {
      return;
    }

    const nextConversations =
      conversations.filter(
        (item) =>
          item.id !==
          conversationId
      );

    if (
      nextConversations.length ===
      0
    ) {
      nextConversations.push(
        createLocalConversation()
      );
    }

    let nextActiveId =
      activeConversationId;

    if (
      activeConversationId ===
      conversationId
    ) {
      nextActiveId =
        nextConversations[0].id;
    }

    setConversations(
      nextConversations
    );

    setActiveConversationId(
      nextActiveId
    );

    closeDeleteDialog();

    await saveConversations(
      nextConversations
    );
  }

  /*
   * =========================
   * SUBSCRIPTIONS
   * =========================
   */

  function applySubscription(
    planId
  ) {
    const plan =
      SUBSCRIPTION_PLANS.find(
        (item) =>
          item.id === planId
      );

    if (!plan) {
      return;
    }

    const unlockedModels =
      MODEL_ACCESS[plan.id];

    if (
      !unlockedModels ||
      unlockedModels.length ===
        0
    ) {
      return;
    }

    setSubscription({
      tier: plan.id,
      unlockedModels,
      selectedModel:
        plan.model,
    });

    if (plan.id === "default") {
      setAttachments([]);
      setAttachmentError("");
    }
  }

  /*
   * Server-backed promo redemption.
   *
   * The promo code remains in the UI.
   * The server decides whether it is valid.
   */
  async function redeemPromoCode() {
    const normalized =
      promoCode
        .trim()
        .toUpperCase();

    if (!normalized) {
      setPromoMessage(
        "Please enter a promo code."
      );

      return;
    }

    if (!credential) {
      setPromoMessage(
        "Please sign in again before redeeming a promo code."
      );

      return;
    }

    setPromoMessage(
      "Checking promo code..."
    );

    try {
      const data =
        await postBackend(
          "redeemPromo",
          {
            credential,
            code:
              normalized,
          }
        );

      const nextSubscription =
        subscriptionFromServer(
          data.subscription ||
            "premium",
          subscription
        );

      setSubscription(
        nextSubscription
      );

      setUser(
        (current) =>
          current
            ? {
                ...current,
                subscription:
                  data.subscription ||
                  "premium",
              }
            : current
      );

      setPromoCode("");

      setPromoMessage(
        "Premium activated for this account."
      );
    } catch (error) {
      console.error(
        "Promo redemption error:",
        error
      );

      setPromoMessage(
        error.message ||
          "That promo code isn't valid."
      );
    }
  }

  function openCheckout(planId) {
    const plan =
      SUBSCRIPTION_PLANS.find(
        (item) =>
          item.id === planId
      );

    if (
      !plan ||
      plan.id === "default"
    ) {
      return;
    }

    setCheckoutPlanId(
      plan.id
    );

    setCardName("");
    setCardNumber("");
    setCardExpiry("");
    setCardCvc("");
    setPaymentError("");
  }

  function closeCheckout() {
    setCheckoutPlanId(null);
    setCardName("");
    setCardNumber("");
    setCardExpiry("");
    setCardCvc("");
    setPaymentError("");
  }

  function handleCardNumberChange(
    event
  ) {
    const digits =
      event.target.value
        .replace(/\D/g, "")
        .slice(0, 16);

    const formatted =
      digits.replace(
        /(.{4})/g,
        "$1 "
      ).trim();

    setCardNumber(
      formatted
    );

    setPaymentError("");
  }

  function handleExpiryChange(
    event
  ) {
    const digits =
      event.target.value
        .replace(/\D/g, "")
        .slice(0, 4);

    let formatted =
      digits;

    if (
      digits.length > 2
    ) {
      formatted =
        `${digits.slice(
          0,
          2
        )}/${digits.slice(2)}`;
    }

    setCardExpiry(
      formatted
    );

    setPaymentError("");
  }

  function handleCvcChange(
    event
  ) {
    const digits =
      event.target.value
        .replace(/\D/g, "")
        .slice(0, 4);

    setCardCvc(
      digits
    );

    setPaymentError("");
  }

  function submitFakePayment(
    event
  ) {
    event.preventDefault();

    setPaymentError(
      "Something went wrong. Please try again"
    );
  }

  async function selectModel(model) {
    /*
     * Re-check the server before allowing
     * Premium model selection.
     */
    if (model === "grass2") {
      const latest =
        await refreshServerSubscription(
          true
        );

      if (
        latest?.subscription !==
        "premium"
      ) {
        setSubscriptionOpen(true);
        return;
      }
    }

    if (
      !subscription.unlockedModels.includes(
        model
      )
    ) {
      if (
        model === "grass2"
      ) {
        setSubscriptionOpen(
          true
        );
      }

      return;
    }

    setSubscription(
      (current) => ({
        ...current,
        selectedModel:
          model,
      })
    );

    if (
      model === "grass1"
    ) {
      setAttachments([]);
      setAttachmentError("");
    }
  }

  function setThemeMode(
    nextTheme
  ) {
    setTheme(
      nextTheme
    );
  }

  /*
   * =========================
   * ADMIN
   * =========================
   */

  async function loadAdminUsers() {
    if (
      !user?.isAdmin ||
      !credential
    ) {
      return;
    }

    setAdminLoading(true);
    setAdminError("");
    setAdminMessage("");

    try {
      const data =
        await postBackend(
          "adminGetUsers",
          {
            credential,
          }
        );

      setAdminUsers(
        Array.isArray(
          data.users
        )
          ? data.users
          : []
      );
    } catch (error) {
      console.error(
        "Could not load admin users:",
        error
      );

      setAdminError(
        error.message ||
          "Could not load users."
      );
    } finally {
      setAdminLoading(false);
    }
  }

  async function revokePremium(
    accountId
  ) {
    if (
      !user?.isAdmin ||
      !credential ||
      !accountId
    ) {
      return;
    }

    setAdminLoading(true);
    setAdminError("");
    setAdminMessage("");

    try {
      const data =
        await postBackend(
          "adminRevokePremium",
          {
            credential,
            accountId,
          }
        );

      setAdminUsers(
        (current) =>
          current.map(
            (account) =>
              account.id ===
              accountId
                ? {
                    ...account,
                    subscription:
                      "free",
                  }
                : account
          )
      );

      setAdminMessage(
        data.user?.email
          ? `Premium revoked for ${data.user.email}.`
          : "Premium revoked."
      );
    } catch (error) {
      console.error(
        "Could not revoke Premium:",
        error
      );

      setAdminError(
        error.message ||
          "Could not revoke Premium."
      );
    } finally {
      setAdminLoading(false);
    }
  }

  useEffect(() => {
    if (
      settingsOpen &&
      user?.isAdmin
    ) {
      loadAdminUsers();
    }
  }, [settingsOpen, user?.isAdmin]);

  /*
   * =========================
   * IMAGE ATTACHMENTS
   * =========================
   */

  function openFilePicker() {
    if (
      isThinking ||
      isLoadingChat
    ) {
      return;
    }

    if (
      subscription.selectedModel !==
      "grass2"
    ) {
      return;
    }

    if (
      !subscription.unlockedModels.includes(
        "grass2"
      )
    ) {
      setSubscriptionOpen(true);
      return;
    }

    fileInputRef.current?.click();
  }

  function removeAttachment(
    id
  ) {
    setAttachments(
      (current) =>
        current.filter(
          (item) =>
            item.id !== id
        )
    );

    setAttachmentError("");
  }

  function handleAttachmentSelection(
    event
  ) {
    const files =
      Array.from(
        event.target.files || []
      );

    event.target.value = "";

    if (files.length === 0) {
      return;
    }

    if (
      subscription.selectedModel !==
      "grass2"
    ) {
      return;
    }

    if (
      !subscription.unlockedModels.includes(
        "grass2"
      )
    ) {
      setSubscriptionOpen(true);
      return;
    }

    const availableSlots =
      MAX_ATTACHMENTS -
      attachments.length;

    if (availableSlots <= 0) {
      setAttachmentError(
        `You can attach up to ${MAX_ATTACHMENTS} images per message.`
      );

      return;
    }

    const selectedFiles =
      files.slice(
        0,
        availableSlots
      );

    const invalidFiles =
      selectedFiles.filter(
        (file) =>
          !file.type.startsWith(
            "image/"
          )
      );

    if (
      invalidFiles.length > 0
    ) {
      setAttachmentError(
        "Only image files can be attached."
      );

      return;
    }

    const oversizedFiles =
      selectedFiles.filter(
        (file) =>
          file.size >
          MAX_IMAGE_SIZE
      );

    if (
      oversizedFiles.length > 0
    ) {
      setAttachmentError(
        "Each image must be 4 MB or smaller."
      );

      return;
    }

    setAttachmentError("");

    Promise.all(
      selectedFiles.map(
        (file) =>
          new Promise(
            (
              resolve,
              reject
            ) => {
              const reader =
                new FileReader();

              reader.onload =
                () => {
                  resolve({
                    id:
                      `attachment-${Date.now()}-${Math.random()
                        .toString(36)
                        .slice(2)}`,

                    name:
                      file.name,

                    type:
                      file.type,

                    size:
                      file.size,

                    dataUrl:
                      reader.result,
                  });
                };

              reader.onerror =
                () => {
                  reject(
                    new Error(
                      `Could not read ${file.name}.`
                    )
                  );
                };

              reader.readAsDataURL(
                file
              );
            }
          )
      )
    )
      .then(
        (newAttachments) => {
          setAttachments(
            (current) => [
              ...current,
              ...newAttachments,
            ]
          );
        }
      )
      .catch(
        (error) => {
          console.error(
            "Image attachment error:",
            error
          );

          setAttachmentError(
            "Could not read the selected image."
          );
        }
      );
  }

  function buildHistoryForBackend(
    messages
  ) {
    return messages.map(
      (message) => ({
        id:
          message.id,

        text:
          message.text,

        sender:
          message.sender,

        ...(message.image
          ? {
              image: {
                name:
                  message.image.name,

                type:
                  message.image.type,
              },
            }
          : {}),
      })
    );
  }

  /*
   * =========================
   * CHAT
   * =========================
   */

  async function sendMessage() {
    const text =
      input.trim();

    const hasAttachments =
      attachments.length >
      0;

    if (
      (!text &&
        !hasAttachments) ||
      isThinking ||
      isLoadingChat ||
      !user
    ) {
      return;
    }

    /*
     * grass2 must always be verified by the
     * server before a new request is sent.
     */
    if (
      subscription.selectedModel ===
      "grass2"
    ) {
      const latest =
        await refreshServerSubscription();

      if (
        !latest ||
        latest.subscription !==
          "premium"
      ) {
        setSubscription(
          getDefaultSubscription()
        );

        setAttachments([]);
        setAttachmentError(
          ""
        );

        setSubscriptionOpen(
          true
        );

        return;
      }
    }

    if (
      hasAttachments &&
      subscription.selectedModel !==
        "grass2"
    ) {
      setAttachments([]);
      setAttachmentError(
        "Image attachments are available with grass2."
      );

      return;
    }

    if (
      hasAttachments &&
      !subscription.unlockedModels.includes(
        "grass2"
      )
    ) {
      setSubscriptionOpen(true);
      return;
    }

    let activeConversation =
      getActiveConversation();

    if (!activeConversation) {
      activeConversation =
        createLocalConversation();

      setConversations([
        activeConversation,
      ]);

      setActiveConversationId(
        activeConversation.id
      );
    }

    const attachmentSnapshot =
      attachments.map(
        (attachment) => ({
          id:
            attachment.id,

          name:
            attachment.name,

          type:
            attachment.type,

          dataUrl:
            attachment.dataUrl,
        })
      );

    const userMessage = {
      id: Date.now(),

      text:
        text ||
        "Please analyse the attached image.",

      sender: "user",

      ...(attachmentSnapshot.length >
      0
        ? {
            image: {
              name:
                attachmentSnapshot
                  .map(
                    (item) =>
                      item.name
                  )
                  .join(", "),

              type:
                attachmentSnapshot
                  .map(
                    (item) =>
                      item.type
                  )
                  .join(", "),

              dataUrls:
                attachmentSnapshot.map(
                  (item) =>
                    item.dataUrl
                ),
            },
          }
        : {}),
    };

    const updatedMessages = [
      ...activeConversation.messages,
      userMessage,
    ];

    const updatedConversation = {
      ...activeConversation,

      title:
        activeConversation.title ===
        "New chat"
          ? createTitle(
              text ||
                attachmentSnapshot[0]
                  ?.name ||
                "Image analysis"
            )
          : activeConversation.title,

      messages:
        updatedMessages,

      updatedAt:
        new Date().toISOString(),
    };

    const conversationsBeforeAI =
      conversations.map(
        (conversation) =>
          conversation.id ===
          updatedConversation.id
            ? updatedConversation
            : conversation
      );

    const conversationExists =
      conversationsBeforeAI.some(
        (conversation) =>
          conversation.id ===
          updatedConversation.id
      );

    if (
      !conversationExists
    ) {
      conversationsBeforeAI.unshift(
        updatedConversation
      );
    }

    setConversations(
      conversationsBeforeAI
    );

    setInput("");
    setAttachments([]);
    setAttachmentError("");
    setIsThinking(true);

    try {
      const data =
        await postBackend(
          "chat",
          {
            message:
              text ||
              "Please analyse the attached image.",

            history:
              JSON.stringify(
                buildHistoryForBackend(
                  updatedMessages
                )
              ),

            credential,

            model:
              subscription.selectedModel,

            ...(attachmentSnapshot.length >
            0
              ? {
                  images:
                    JSON.stringify(
                      attachmentSnapshot.map(
                        (
                          attachment
                        ) => ({
                          name:
                            attachment.name,

                          type:
                            attachment.type,

                          dataUrl:
                            attachment.dataUrl,
                        })
                      )
                    ),
                }
              : {}),
          }
        );

      const assistantMessage = {
        id:
          Date.now() + 1,

        text:
          data.message,

        sender:
          "assistant",
      };

      const finalConversation = {
        ...updatedConversation,

        messages: [
          ...updatedMessages,
          assistantMessage,
        ],

        updatedAt:
          new Date().toISOString(),
      };

      const finalConversations =
        conversationsBeforeAI.map(
          (conversation) =>
            conversation.id ===
            finalConversation.id
              ? finalConversation
              : conversation
        );

      setConversations(
        finalConversations
      );

      await saveConversations(
        finalConversations
      );
    } catch (error) {
      console.error(
        "grassAI chat error:",
        error
      );

      /*
       * If the backend rejects grass2 because
       * Premium was revoked, immediately sync
       * the UI back to the free plan.
       */
      if (
        error.message &&
        (
          error.message
            .toLowerCase()
            .includes("premium") ||
          error.message
            .toLowerCase()
            .includes("grass2")
        )
      ) {
        try {
          await refreshServerSubscription();
        } catch {
          // Keep the original error message.
        }
      }

      const errorMessage = {
        id:
          Date.now() + 1,

        text:
          error.message &&
          error.message.includes(
            "image"
          )
            ? error.message
            : error.message &&
              error.message.includes(
                "Premium"
              )
            ? "Your Premium access is no longer active. grass2 has been locked."
            : "Sorry, something went wrong while connecting to grassAI.",

        sender:
          "assistant",
      };

      const failedConversation = {
        ...updatedConversation,

        messages: [
          ...updatedMessages,
          errorMessage,
        ],

        updatedAt:
          new Date().toISOString(),
      };

      const finalConversations =
        conversationsBeforeAI.map(
          (conversation) =>
            conversation.id ===
            failedConversation.id
              ? failedConversation
              : conversation
        );

      setConversations(
        finalConversations
      );

      await saveConversations(
        finalConversations
      );
    } finally {
      setIsThinking(false);
    }
  }

  function handleKeyDown(event) {
    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();

      sendMessage();
    }
  }

  const activeConversation =
    getActiveConversation();

  const currentPlan =
    SUBSCRIPTION_PLANS.find(
      (plan) =>
        plan.id ===
        subscription.tier
    ) ||
    SUBSCRIPTION_PLANS[0];

  const checkoutPlan =
    SUBSCRIPTION_PLANS.find(
      (plan) =>
        plan.id ===
        checkoutPlanId
    );

  const premiumUserCount =
    adminUsers.filter(
      (account) =>
        account.subscription ===
        "premium"
    ).length;

  if (!user) {
    return (
      <Login
        onLogin={handleLogin}
      />
    );
  }

  return (
    <main
      className={`app theme-${theme}`}
    >
      <header className="topbar">
        <button
          className="sidebar-toggle"
          onClick={() =>
            setSidebarOpen(
              (current) =>
                !current
            )
          }
          aria-label="Toggle sidebar"
        >
          ☰
        </button>

        <div className="brand">
          <span className="logo">
            🌱
          </span>

          <span className="brand-name">
            grassAI
          </span>
        </div>

        <div className="account">
          {user.picture && (
            <img
              src={user.picture}
              alt=""
              className="account-picture"
            />
          )}

          <span>
            {user.name}
          </span>

          <button
            className="settings-button"
            onClick={() =>
              setSettingsOpen(
                true
              )
            }
            aria-label="Open settings"
          >
            ⚙
          </button>
        </div>
      </header>

      <div
        className={`app-body ${
          sidebarOpen
            ? "sidebar-visible"
            : "sidebar-hidden"
        }`}
      >
        <aside className="sidebar">
          <button
            className="new-chat-button"
            onClick={
              createNewChat
            }
          >
            <span className="new-chat-plus">
              +
            </span>

            <span>
              New chat
            </span>
          </button>

          <div className="sidebar-section-title">
            Conversations
          </div>

          <div className="conversation-list">
            {conversations.map(
              (conversation) => (
                <div
                  className={`conversation-item ${
                    conversation.id ===
                    activeConversationId
                      ? "conversation-active"
                      : ""
                  }`}
                  key={
                    conversation.id
                  }
                >
                  <button
                    className="conversation-select"
                    onClick={() =>
                      switchConversation(
                        conversation.id
                      )
                    }
                  >
                    <span className="conversation-icon">
                      💬
                    </span>

                    <span className="conversation-title">
                      {
                        conversation.title
                      }
                    </span>
                  </button>

                  <div className="conversation-actions">
                    <button
                      onClick={() =>
                        openRenameDialog(
                          conversation.id
                        )
                      }
                      aria-label="Rename conversation"
                    >
                      ✎
                    </button>

                    <button
                      onClick={() =>
                        openDeleteDialog(
                          conversation.id
                        )
                      }
                      aria-label="Delete conversation"
                    >
                      ×
                    </button>
                  </div>
                </div>
              )
            )}
          </div>

          <div className="sidebar-bottom">
            <button
              className="sidebar-settings-button"
              onClick={() =>
                setSettingsOpen(
                  true
                )
              }
            >
              <span>⚙</span>
              <span>Settings</span>
            </button>
          </div>
        </aside>

        <section className="main-content">
          <section className="chat-area">
            {isLoadingChat ? (
              <div className="welcome">
                <div className="grass-orb">
                  <div className="grass-orb-core">
                    🌱
                  </div>
                </div>

                <h1>
                  Loading your chats...
                </h1>

                <p>
                  Getting your conversations
                  from the cloud.
                </p>
              </div>
            ) : !activeConversation ? (
              <div className="welcome">
                <div className="grass-orb">
                  <div className="grass-orb-core">
                    🌱
                  </div>
                </div>

                <h1>
                  How can I help?
                </h1>

                <p>
                  Ask grassAI anything.
                </p>
              </div>
            ) : activeConversation
                .messages.length === 0 ? (
              <div className="welcome">
                <div
                  className={`grass-orb ${
                    isThinking
                      ? "grass-orb-thinking"
                      : ""
                  }`}
                >
                  <div className="grass-orb-core">
                    🌱
                  </div>
                </div>

                <h1>
                  How can I help?
                </h1>

                <p>
                  Ask grassAI anything.
                </p>
              </div>
            ) : (
              <div className="messages">
                {activeConversation.messages.map(
                  (message) => (
                    <div
                      className={`message ${
                        message.sender ===
                        "user"
                          ? "user-message"
                          : "assistant-message"
                      }`}
                      key={
                        message.id
                      }
                    >
                      {message.sender ===
                        "user" &&
                        message.image
                          ?.dataUrls?.length >
                          0 && (
                          <div
                            style={{
                              display:
                                "flex",
                              flexWrap:
                                "wrap",
                              gap:
                                "8px",
                              marginBottom:
                                message.text
                                  ? "10px"
                                  : "0",
                            }}
                          >
                            {message.image.dataUrls.map(
                              (
                                imageUrl,
                                index
                              ) => (
                                <img
                                  key={`${message.id}-image-${index}`}
                                  src={
                                    imageUrl
                                  }
                                  alt={
                                    message.image
                                      .name ||
                                    "Attached image"
                                  }
                                  style={{
                                    display:
                                      "block",
                                    width:
                                      "min(260px, 100%)",
                                    maxHeight:
                                      "260px",
                                    objectFit:
                                      "contain",
                                    borderRadius:
                                      "14px",
                                    border:
                                      "1px solid rgba(0,0,0,0.08)",
                                    background:
                                      "rgba(255,255,255,0.55)",
                                  }}
                                />
                              )
                            )}
                          </div>
                        )}

                      {message.sender ===
                      "assistant" ? (
                        <ReactMarkdown
                          remarkPlugins={[
                            remarkGfm,
                            remarkMath,
                          ]}
                          rehypePlugins={[
                            rehypeKatex,
                          ]}
                        >
                          {
                            message.text
                          }
                        </ReactMarkdown>
                      ) : (
                        message.text
                      )}
                    </div>
                  )
                )}

                {isThinking && (
                  <div className="assistant-thinking">
                    <div className="thinking-orb">
                      <span />
                      <span />
                      <span />
                    </div>

                    <span className="thinking-text">
                      grassAI is thinking
                    </span>
                  </div>
                )}
              </div>
            )}
          </section>

          <div className="chat-input">
            {attachments.length >
              0 && (
              <div
                style={{
                  position:
                    "absolute",
                  left:
                    "14px",
                  right:
                    "14px",
                  bottom:
                    "calc(100% + 10px)",
                  display:
                    "flex",
                  flexWrap:
                    "wrap",
                  gap:
                    "10px",
                  padding:
                    "10px",
                  borderRadius:
                    "18px",
                  background:
                    "rgba(255,255,255,0.82)",
                  backdropFilter:
                    "blur(18px)",
                  WebkitBackdropFilter:
                    "blur(18px)",
                  border:
                    "1px solid rgba(0,0,0,0.08)",
                  boxShadow:
                    "0 12px 30px rgba(0,0,0,0.10)",
                  zIndex:
                    5,
                }}
              >
                {attachments.map(
                  (
                    attachment
                  ) => (
                    <div
                      key={
                        attachment.id
                      }
                      style={{
                        position:
                          "relative",
                        width:
                          "76px",
                        height:
                          "76px",
                      }}
                    >
                      <img
                        src={
                          attachment.dataUrl
                        }
                        alt={
                          attachment.name
                        }
                        title={
                          attachment.name
                        }
                        style={{
                          width:
                            "76px",
                          height:
                            "76px",
                          objectFit:
                            "cover",
                          borderRadius:
                            "14px",
                          display:
                            "block",
                          border:
                            "1px solid rgba(0,0,0,0.10)",
                        }}
                      />

                      <button
                        type="button"
                        onClick={() =>
                          removeAttachment(
                            attachment.id
                          )
                        }
                        aria-label={`Remove ${attachment.name}`}
                        style={{
                          position:
                            "absolute",
                          top:
                            "-7px",
                          right:
                            "-7px",
                          width:
                            "24px",
                          height:
                            "24px",
                          borderRadius:
                            "50%",
                          border:
                            "1px solid rgba(0,0,0,0.10)",
                          background:
                            "rgba(255,255,255,0.96)",
                          cursor:
                            "pointer",
                          display:
                            "grid",
                          placeItems:
                            "center",
                          fontSize:
                            "15px",
                          lineHeight:
                            1,
                          boxShadow:
                            "0 4px 12px rgba(0,0,0,0.12)",
                        }}
                      >
                        ×
                      </button>
                    </div>
                  )
                )}
              </div>
            )}

            {attachmentError && (
              <div
                role="status"
                style={{
                  position:
                    "absolute",
                  left:
                    "18px",
                  bottom:
                    "calc(100% + 8px)",
                  maxWidth:
                    "calc(100% - 36px)",
                  padding:
                    "8px 12px",
                  borderRadius:
                    "12px",
                  background:
                    "rgba(255,245,245,0.96)",
                  color:
                    "#b42318",
                  fontSize:
                    "13px",
                  zIndex:
                    6,
                }}
              >
                {
                  attachmentError
                }
              </div>
            )}

            <input
              ref={
                fileInputRef
              }
              type="file"
              accept="image/*"
              multiple
              onChange={
                handleAttachmentSelection
              }
              style={{
                display:
                  "none",
              }}
            />

            {subscription.selectedModel ===
              "grass2" && (
              <button
                type="button"
                onClick={
                  openFilePicker
                }
                disabled={
                  isThinking ||
                  isLoadingChat
                }
                aria-label="Attach images"
                title="Attach images"
                style={{
                  flexShrink:
                    0,
                  width:
                    "40px",
                  height:
                    "40px",
                  borderRadius:
                    "50%",
                  border:
                    "1px solid rgba(255,255,255,0.55)",
                  background:
                    "linear-gradient(135deg, rgba(255,255,255,0.82), rgba(232,244,255,0.68))",
                  cursor:
                    isThinking ||
                    isLoadingChat
                      ? "not-allowed"
                      : "pointer",
                  opacity:
                    isThinking ||
                    isLoadingChat
                      ? 0.5
                      : 1,
                  display:
                    "grid",
                  placeItems:
                    "center",
                  fontSize:
                    "21px",
                  boxShadow:
                    "0 6px 18px rgba(90,120,255,0.12)",
                  transition:
                    "transform 180ms ease, box-shadow 180ms ease",
                }}
              >
                ＋
              </button>
            )}

            <input
              type="text"
              value={input}
              onChange={(event) =>
                setInput(
                  event.target.value
                )
              }
              onKeyDown={
                handleKeyDown
              }
              placeholder={
                attachments.length >
                0
                  ? "Ask grassAI about the image..."
                  : "Message grassAI..."
              }
              disabled={
                isThinking ||
                isLoadingChat
              }
            />

            <button
              className={
                (input.trim() ||
                  attachments.length >
                    0) &&
                !isThinking &&
                !isLoadingChat
                  ? "send-button-active"
                  : ""
              }
              onClick={
                sendMessage
              }
              aria-label="Send message"
              disabled={
                (!input.trim() &&
                  attachments.length ===
                    0) ||
                isThinking ||
                isLoadingChat
              }
            >
              ↑
            </button>
          </div>
        </section>
      </div>

      {settingsOpen && (
        <div
          className="settings-overlay"
          onClick={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              setSettingsOpen(
                false
              );
            }
          }}
        >
          <section className="settings-panel">
            <div className="settings-header">
              <div>
                <h2>Settings</h2>

                <p>
                  Manage your grassAI account.
                </p>
              </div>

              <button
                className="settings-close"
                onClick={() =>
                  setSettingsOpen(
                    false
                  )
                }
              >
                ×
              </button>
            </div>

            <div className="settings-account-card">
              {user.picture && (
                <img
                  src={user.picture}
                  alt=""
                  className="settings-account-picture"
                />
              )}

              <div>
                <strong>
                  {user.name}
                </strong>

                <span>
                  {user.email}
                </span>
              </div>
            </div>

            <button
              className="subscription-card"
              onClick={() =>
                setSubscriptionOpen(
                  true
                )
              }
            >
              <div className="subscription-card-icon">
                {currentPlan.id ===
                "default"
                  ? "🌱"
                  : "✨"}
              </div>

              <div className="subscription-card-text">
                <strong>
                  {currentPlan.name}
                </strong>

                <span>
                  {currentPlan.id ===
                  "default"
                    ? "Free plan"
                    : `${currentPlan.price} plan`}
                </span>
              </div>

              <span className="subscription-card-arrow">
                →
              </span>
            </button>

            <div className="settings-model-card">
              <div>
                <span className="settings-label">
                  Current model
                </span>

                <strong>
                  {
                    MODEL_INFO[
                      subscription.selectedModel
                    ]?.name ||
                    subscription.selectedModel
                  }
                </strong>
              </div>

              <span className="settings-model-status">
                {subscription.unlockedModels.includes(
                  subscription.selectedModel
                )
                  ? "Unlocked"
                  : "Locked"}
              </span>
            </div>

            <div className="settings-model-selector">
              <div className="settings-selector-heading">
                <span className="settings-label">
                  Models
                </span>

                <span className="settings-selector-subtitle">
                  Choose your AI
                </span>
              </div>

              <div className="model-options">
                {[
                  "grass1",
                  "grass2",
                ].map(
                  (model) => {
                    const info =
                      MODEL_INFO[
                        model
                      ];

                    const unlocked =
                      subscription.unlockedModels.includes(
                        model
                      );

                    const selected =
                      subscription.selectedModel ===
                      model;

                    return (
                      <button
                        key={
                          model
                        }
                        className={`model-option ${
                          selected
                            ? "model-option-selected"
                            : ""
                        } ${
                          !unlocked
                            ? "model-option-locked"
                            : ""
                        }`}
                        onClick={() =>
                          selectModel(
                            model
                          )
                        }
                      >
                        <span className="model-option-icon">
                          {
                            info.icon
                          }
                        </span>

                        <span className="model-option-main">
                          <span className="model-option-title-row">
                            <strong>
                              {
                                info.name
                              }
                            </strong>

                            <span className="model-option-badge">
                              {
                                info.badge
                              }
                            </span>
                          </span>

                          <span className="model-option-description">
                            {
                              info.description
                            }
                          </span>

                          <span className="model-option-detail">
                            {
                              info.detail
                            }
                          </span>
                        </span>

                        <span className="model-option-state">
                          {selected
                            ? "✓"
                            : unlocked
                            ? "Select"
                            : "🔒"}
                        </span>
                      </button>
                    );
                  }
                )}
              </div>
            </div>

            <div className="settings-appearance">
              <div className="settings-selector-heading">
                <span className="settings-label">
                  Appearance
                </span>

                <span className="settings-selector-subtitle">
                  Customize your interface
                </span>
              </div>

              <div className="theme-options">
                <button
                  className={`theme-option ${
                    theme ===
                    "light"
                      ? "theme-option-selected"
                      : ""
                  }`}
                  onClick={() =>
                    setThemeMode(
                      "light"
                    )
                  }
                >
                  <span className="theme-option-icon">
                    ☀️
                  </span>

                  <span>
                    <strong>
                      Light
                    </strong>

                    <small>
                      Clean and bright
                    </small>
                  </span>

                  {theme ===
                    "light" && (
                    <span className="theme-option-check">
                      ✓
                    </span>
                  )}
                </button>

                <button
                  className={`theme-option ${
                    theme ===
                    "dark"
                      ? "theme-option-selected"
                      : ""
                  }`}
                  onClick={() =>
                    setThemeMode(
                      "dark"
                    )
                  }
                >
                  <span className="theme-option-icon">
                    🌙
                  </span>

                  <span>
                    <strong>
                      Dark
                    </strong>

                    <small>
                      Deep and immersive
                    </small>
                  </span>

                  {theme ===
                    "dark" && (
                    <span className="theme-option-check">
                      ✓
                    </span>
                  )}
                </button>
              </div>
            </div>

            {user.isAdmin && (
              <div className="admin-section">
                <div className="settings-selector-heading">
                  <span className="settings-label">
                    Admin
                  </span>

                  <span className="settings-selector-subtitle">
                    Account management
                  </span>
                </div>

                <div className="admin-summary">
                  <div>
                    <strong>
                      {adminUsers.length}
                    </strong>

                    <span>
                      Total users
                    </span>
                  </div>

                  <div>
                    <strong>
                      {
                        premiumUserCount
                      }
                    </strong>

                    <span>
                      Premium users
                    </span>
                  </div>

                  <button
                    type="button"
                    className="admin-refresh-button"
                    onClick={
                      loadAdminUsers
                    }
                    disabled={
                      adminLoading
                    }
                  >
                    {adminLoading
                      ? "Loading..."
                      : "Refresh"}
                  </button>
                </div>

                {adminError && (
                  <div
                    className="admin-error"
                    role="status"
                  >
                    {
                      adminError
                    }
                  </div>
                )}

                {adminMessage && (
                  <div
                    className="admin-message"
                    role="status"
                  >
                    {
                      adminMessage
                    }
                  </div>
                )}

                <div className="admin-user-list">
                  {adminUsers.map(
                    (account) => {
                      const isPremium =
                        account.subscription ===
                        "premium";

                      const isSelf =
                        account.email?.toLowerCase() ===
                        user.email?.toLowerCase();

                      return (
                        <div
                          className="admin-user-card"
                          key={
                            account.id
                          }
                        >
                          <div className="admin-user-info">
                            {account.picture && (
                              <img
                                src={
                                  account.picture
                                }
                                alt=""
                                className="admin-user-picture"
                              />
                            )}

                            <div>
                              <strong>
                                {
                                  account.name
                                }
                              </strong>

                              <span>
                                {
                                  account.email
                                }
                              </span>
                            </div>
                          </div>

                          <div className="admin-user-actions">
                            <span
                              className={`admin-subscription-status ${
                                isPremium
                                  ? "admin-subscription-premium"
                                  : "admin-subscription-free"
                              }`}
                            >
                              {isPremium
                                ? "Premium"
                                : "Free"}
                            </span>

                            {isPremium &&
                              !isSelf && (
                                <button
                                  type="button"
                                  className="admin-revoke-button"
                                  onClick={() =>
                                    revokePremium(
                                      account.id
                                    )
                                  }
                                  disabled={
                                    adminLoading
                                  }
                                >
                                  Revoke
                                </button>
                              )}
                          </div>
                        </div>
                      );
                    }
                  )}

                  {!adminLoading &&
                    adminUsers.length ===
                      0 && (
                      <div className="admin-empty">
                        No accounts found.
                      </div>
                    )}
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {subscriptionOpen && !checkoutPlan && (
        <div
          className="settings-overlay"
          onClick={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              setSubscriptionOpen(
                false
              );
            }
          }}
        >
          <section className="subscription-panel">
            <div className="settings-header">
              <div>
                <h2>
                  Subscriptions
                </h2>

                <p>
                  Choose the grassAI plan that fits you.
                </p>
              </div>

              <button
                className="settings-close"
                onClick={() =>
                  setSubscriptionOpen(
                    false
                  )
                }
              >
                ×
              </button>
            </div>

            <div className="plan-grid">
              {SUBSCRIPTION_PLANS.map(
                (plan) => {
                  const active =
                    subscription.tier ===
                    plan.id;

                  return (
                    <div
                      className={`plan-card ${
                        active
                          ? "plan-card-active"
                          : ""
                      }`}
                      key={
                        plan.id
                      }
                    >
                      <div className="plan-card-top">
                        <div>
                          <span className="plan-name">
                            {plan.name}
                          </span>

                          <span className="plan-model">
                            {plan.model}
                          </span>
                        </div>

                        {active && (
                          <span className="plan-active-badge">
                            Current
                          </span>
                        )}
                      </div>

                      <div className="plan-price">
                        {plan.price}

                        {plan.id !==
                          "default" && (
                          <span>
                            /month
                          </span>
                        )}
                      </div>

                      <p className="plan-description">
                        {
                          plan.description
                        }
                      </p>

                      <div className="plan-features">
                        {plan.features.map(
                          (
                            feature
                          ) => (
                            <div
                              key={
                                feature
                              }
                            >
                              <span>
                                ✓
                              </span>

                              <span>
                                {
                                  feature
                                }
                              </span>
                            </div>
                          )
                        )}
                      </div>

                      {plan.id ===
                      "default" ? (
                        <button
                          className="plan-button plan-button-current"
                          disabled
                        >
                          {active
                            ? "Current plan"
                            : "Free plan"}
                        </button>
                      ) : (
                        <button
                          className="plan-button"
                          onClick={() =>
                            openCheckout(
                              plan.id
                            )
                          }
                          disabled={
                            active
                          }
                        >
                          {active
                            ? "Current plan"
                            : "Choose plan"}
                        </button>
                      )}
                    </div>
                  );
                }
              )}
            </div>

            <div className="promo-section">
              <div className="promo-heading">
                Have a promo code?
              </div>

              <div className="promo-row">
                <input
                  type="text"
                  value={promoCode}
                  onChange={(event) =>
                    setPromoCode(
                      event.target.value
                    )
                  }
                  placeholder="Enter promo code"
                  className="promo-input"
                />

                <button
                  type="button"
                  onClick={
                    redeemPromoCode
                  }
                  className="promo-button"
                >
                  Redeem
                </button>
              </div>

              {promoMessage && (
                <div className="promo-message">
                  {promoMessage}
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {subscriptionOpen && checkoutPlan && (
        <div className="settings-overlay">
          <section className="subscription-panel checkout-panel">
            <div className="settings-header">
              <div>
                <button
                  type="button"
                  className="checkout-back-button"
                  onClick={
                    closeCheckout
                  }
                >
                  ← Back
                </button>

                <h2>
                  {checkoutPlan.name}
                </h2>

                <p>
                  Demo checkout
                </p>
              </div>

              <button
                className="settings-close"
                onClick={
                  closeCheckout
                }
              >
                ×
              </button>
            </div>

            <div className="checkout-plan-summary">
              <div>
                <span>
                  {checkoutPlan.name}
                </span>

                <strong>
                  {checkoutPlan.price}
                  <small>
                    /month
                  </small>
                </strong>
              </div>

              <span>
                grassAI {checkoutPlan.model}
              </span>
            </div>

            <form
              className="checkout-form"
              onSubmit={
                submitFakePayment
              }
            >
              <div className="checkout-field">
                <label htmlFor="card-name">
                  Name on card
                </label>

                <input
                  id="card-name"
                  type="text"
                  value={
                    cardName
                  }
                  onChange={(
                    event
                  ) => {
                    setCardName(
                      event.target.value
                    );

                    setPaymentError(
                      ""
                    );
                  }}
                  placeholder="Cardholder name"
                  autoComplete="off"
                />
              </div>

              <div className="checkout-field">
                <label htmlFor="card-number">
                  Card number
                </label>

                <input
                  id="card-number"
                  type="text"
                  inputMode="numeric"
                  value={
                    cardNumber
                  }
                  onChange={
                    handleCardNumberChange
                  }
                  placeholder="1234 5678 9012 3456"
                  autoComplete="off"
                />
              </div>

              <div className="checkout-row">
                <div className="checkout-field">
                  <label htmlFor="card-expiry">
                    Expiry
                  </label>

                  <input
                    id="card-expiry"
                    type="text"
                    inputMode="numeric"
                    value={
                      cardExpiry
                    }
                    onChange={
                      handleExpiryChange
                    }
                    placeholder="MM/YY"
                    autoComplete="off"
                  />
                </div>

                <div className="checkout-field">
                  <label htmlFor="card-cvc">
                    CVC
                  </label>

                  <input
                    id="card-cvc"
                    type="password"
                    inputMode="numeric"
                    value={
                      cardCvc
                    }
                    onChange={
                      handleCvcChange
                    }
                    placeholder="123"
                    autoComplete="off"
                  />
                </div>
              </div>

              <div className="checkout-demo-notice">
                <span>
                  🛡️
                </span>

                <p>
                  Demo checkout only. Do not
                  enter real card information.
                  No payment is processed and
                  nothing is sent to grassAI.
                </p>
              </div>

              {paymentError && (
                <div
                  className="checkout-error"
                  role="status"
                >
                  {paymentError}
                </div>
              )}

              <button
                type="submit"
                className="checkout-buy-button"
              >
                Buy subscription
                <span>
                  {checkoutPlan.price}
                </span>
              </button>
            </form>
          </section>
        </div>
      )}

      {renameDialog.open && (
        <div
          className="dialog-overlay"
          onClick={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closeRenameDialog();
            }
          }}
        >
          <section className="dialog-card">
            <div className="dialog-icon">
              ✎
            </div>

            <h2>
              Rename conversation
            </h2>

            <p>
              Give this conversation a new name.
            </p>

            <input
              className="dialog-input"
              value={
                renameDialog.value
              }
              onChange={(event) =>
                setRenameDialog(
                  (current) => ({
                    ...current,
                    value:
                      event.target
                        .value,
                  })
                )
              }
              onKeyDown={(event) => {
                if (
                  event.key ===
                  "Enter"
                ) {
                  confirmRename();
                }

                if (
                  event.key ===
                  "Escape"
                ) {
                  closeRenameDialog();
                }
              }}
              autoFocus
              maxLength={60}
            />

            <div className="dialog-actions">
              <button
                className="dialog-button dialog-button-secondary"
                onClick={
                  closeRenameDialog
                }
              >
                Cancel
              </button>

              <button
                className="dialog-button dialog-button-primary"
                onClick={
                  confirmRename
                }
                disabled={
                  !renameDialog.value.trim()
                }
              >
                Rename
              </button>
            </div>
          </section>
        </div>
      )}

      {deleteDialog.open && (
        <div
          className="dialog-overlay"
          onClick={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closeDeleteDialog();
            }
          }}
        >
          <section className="dialog-card">
            <div className="dialog-icon dialog-icon-danger">
              ×
            </div>

            <h2>
              Delete conversation?
            </h2>

            <p>
              This will permanently remove{" "}
              <strong>
                “{deleteDialog.title}”
              </strong>{" "}
              from your conversation list.
            </p>

            <div className="dialog-actions">
              <button
                className="dialog-button dialog-button-secondary"
                onClick={
                  closeDeleteDialog
                }
              >
                Cancel
              </button>

              <button
                className="dialog-button dialog-button-danger"
                onClick={
                  confirmDelete
                }
              >
                Delete
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

export default App;